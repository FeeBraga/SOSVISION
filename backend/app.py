import base64
import logging
import os
import threading
import time
from collections import Counter, deque
from datetime import datetime, timezone, timedelta

import cv2
import mediapipe as mp
import numpy as np
import requests
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from gesture_detection import reconhecer_gesto

TEMPO_CONFIRMACAO = 1.5
COOLDOWN = 10
MAX_FRAME_BYTES = 2_000_000
CAMERA_TIMEOUT_SECONDS = 30

camera_token = os.getenv("CAMERA_TOKEN", "")
camera_id = os.getenv("CAMERA_ID", "esp32_s3_01")
callmebot_phone = os.getenv("CALLMEBOT_PHONE", "")
callmebot_apikey = os.getenv("CALLMEBOT_APIKEY", "")
test_mode = os.getenv("MODO_TESTE", "false").lower() == "true"
supabase_url = os.getenv("SUPABASE_URL", os.getenv("VITE_SUPABASE_URL", "")).rstrip("/")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:5173"
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="SOS Vision API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

hands = mp.solutions.hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.55,
    min_tracking_confidence=0.5,
)
vision_lock = threading.Lock()
recent_gestures = deque(maxlen=5)
gesture_started_at = None
current_gesture = None
alert_sent_for_gesture = False
last_alert_at = 0.0
last_frame_received_at = None
logger = logging.getLogger("uvicorn.error")


class GestureConfirmation:
    def __init__(self):
        self.current_gesture: str | None = None
        self.started_at: float | None = None
        self.last_alert_at: float | None = None
        self.alert_sent = False

    def observe(self, detected: str | None, now: float) -> bool:
        if detected != self.current_gesture:
            self.current_gesture = detected
            self.started_at = now if detected else None
            self.alert_sent = False

        if (
            detected is not None
            and self.started_at is not None
            and not self.alert_sent
            and now - self.started_at >= TEMPO_CONFIRMACAO
            and (
                self.last_alert_at is None
                or now - self.last_alert_at >= COOLDOWN
            )
        ):
            self.last_alert_at = now
            self.alert_sent = True
            return True
        return False

    def retry_after_failure(self):
        self.alert_sent = False
        self.last_alert_at = None


gesture_confirmation = GestureConfirmation()


class AlertPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tipo: str
    mensagem: str = Field(min_length=1)
    data_hora: str
    cidade: str
    regiao: str
    pais: str
    latitude: float | None = None
    longitude: float | None = None
    mapa: str | None = None
    ip: str | None = None
    snapshot: str | None = None
    camera_id: str | None = None


class AlertStatusUpdate(BaseModel):
    status: str


def _database_request(method: str, path: str, **kwargs):
    if not supabase_url or not supabase_key:
        raise HTTPException(status_code=503, detail="Banco de dados não configurado")
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    headers.update(kwargs.pop("headers", {}))
    try:
        result = requests.request(
            method,
            f"{supabase_url}/rest/v1/{path}",
            headers=headers,
            timeout=10,
            **kwargs,
        )
    except requests.RequestException as error:
        raise HTTPException(status_code=503, detail="Banco de dados indisponível") from error
    if not result.ok:
        logger.error(
            "Supabase request to %s failed with HTTP %s", path, result.status_code
        )
        raise HTTPException(status_code=503, detail="Falha ao acessar o banco de dados")
    return result


def _store_alert(alert: AlertPayload):
    payload = alert.model_dump()
    if not payload["mapa"] and payload["latitude"] is not None and payload["longitude"] is not None:
        payload["mapa"] = (
            f"https://www.google.com/maps?q={payload['latitude']},{payload['longitude']}"
        )
    payload["status"] = "pendente"
    payload["camera_id"] = payload["camera_id"] or camera_id
    result = _database_request(
        "POST",
        "alertas",
        params={"select": "*"},
        headers={"Prefer": "return=representation"},
        json=payload,
    )
    rows = result.json()
    return rows[0] if rows else payload


def _make_gesture_alert(gesture: str, jpeg: bytes):
    names = {
        "PERDIDO": "possível situação de perda/desorientação",
        "ACIDENTE": "possível acidente",
        "SEQUESTRO": "possível sequestro/coação",
    }
    now = datetime.now(timezone(timedelta(hours=-3)))
    payload = AlertPayload(
        tipo=gesture,
        mensagem=(
            f"🚨 ALERTA SOS\nTipo: {names[gesture]}.\n"
            "O sistema detectou um pedido de ajuda."
        ),
        data_hora=now.isoformat(),
        cidade="Desconhecida",
        regiao="Desconhecida",
        pais="Brasil",
        snapshot=base64.b64encode(jpeg).decode("ascii"),
        camera_id=camera_id,
    )
    saved_alert = _store_alert(payload)
    return saved_alert, payload


def _send_whatsapp_alert(alert: AlertPayload):
    if test_mode:
        logger.info("MODO_TESTE ativo; alerta WhatsApp não enviado.")
        return
    if not callmebot_phone or not callmebot_apikey:
        logger.warning("CallMeBot não configurado; alerta salvo sem envio de WhatsApp.")
        return

    message = (
        f"{alert.mensagem}\n\nHorário: {alert.data_hora}\n"
        "Localização da câmera: indisponível (sem GPS no dispositivo)."
    )
    try:
        response = requests.get(
            "https://api.callmebot.com/whatsapp.php",
            params={
                "phone": callmebot_phone,
                "text": message,
                "apikey": callmebot_apikey,
            },
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException:
        logger.exception("Falha ao enviar o alerta pelo CallMeBot.")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "sos-vision-api"}


@app.get("/api/camera/status")
def camera_status():
    last_received = last_frame_received_at
    connected = bool(
        last_received
        and (datetime.now(timezone.utc) - last_received).total_seconds()
        <= CAMERA_TIMEOUT_SECONDS
    )
    return {
        "connected": connected,
        "last_image_received_at": last_received.isoformat() if last_received else None,
    }


@app.post("/api/camera/frame")
async def receive_camera_frame(
    request: Request,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    if not camera_token:
        raise HTTPException(status_code=503, detail="Autenticação da câmera não configurada")
    if authorization != f"Bearer {camera_token}":
        raise HTTPException(status_code=401, detail="Token da câmera inválido")

    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "image/jpeg":
        raise HTTPException(status_code=415, detail="Envie o quadro como image/jpeg")
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_FRAME_BYTES:
                raise HTTPException(status_code=413, detail="Imagem excede o limite permitido")
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Content-Length inválido") from error
    frame_bytes = bytearray()
    async for chunk in request.stream():
        frame_bytes.extend(chunk)
        if len(frame_bytes) > MAX_FRAME_BYTES:
            raise HTTPException(status_code=413, detail="Imagem excede o limite permitido")
    jpeg = bytes(frame_bytes)
    if not jpeg:
        raise HTTPException(status_code=400, detail="Imagem vazia")

    try:
        body, notification = await run_in_threadpool(_process_frame, jpeg)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="JPEG inválido") from error
    if notification is not None:
        background_tasks.add_task(_send_whatsapp_alert, notification)
    return body


def _process_frame(jpeg: bytes):
    global last_frame_received_at

    frame = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Invalid JPEG image")
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    notification = None

    with vision_lock:
        last_frame_received_at = datetime.now(timezone.utc)
        result = hands.process(rgb)
        candidate = (
            reconhecer_gesto(result.multi_hand_landmarks[0])
            if result.multi_hand_landmarks
            else None
        )
        recent_gestures.append(candidate)
        votes = Counter(gesture for gesture in recent_gestures if gesture is not None)
        detected = next(
            (gesture for gesture, count in votes.most_common(1) if count >= 3),
            None,
        )

        should_alert = gesture_confirmation.observe(detected, time.monotonic())
        if should_alert:
            gesture = detected
        else:
            gesture = None

    if gesture is not None:
        try:
            saved_alert, notification = _make_gesture_alert(gesture, jpeg)
        except HTTPException:
            gesture_confirmation.retry_after_failure()
            raise
        return {"received": True, "gesture": detected, "alert": saved_alert}, notification
    return {"received": True, "gesture": detected, "alert": None}, None


@app.get("/api/alertas")
def list_alerts():
    result = _database_request(
        "GET",
        "alertas",
        params={"select": "*", "order": "created_at.desc", "limit": "100"},
    )
    return result.json()


@app.post("/api/alertas")
def create_alert(alert: AlertPayload):
    if alert.tipo not in {"PERDIDO", "ACIDENTE", "SEQUESTRO"}:
        raise HTTPException(status_code=422, detail="Tipo de alerta inválido")
    return _store_alert(alert)


@app.patch("/api/alertas/{alert_id}")
def update_alert_status(alert_id: str, update: AlertStatusUpdate):
    if update.status not in {"pendente", "em atendimento", "resolvido"}:
        raise HTTPException(status_code=422, detail="Status de alerta inválido")
    result = _database_request(
        "PATCH",
        "alertas",
        params={"id": f"eq.{alert_id}", "select": "*"},
        headers={"Prefer": "return=representation"},
        json={"status": update.status},
    )
    rows = result.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    return rows[0]


@app.delete("/api/alertas/{alert_id}")
def delete_alert(alert_id: str):
    _database_request("DELETE", "alertas", params={"id": f"eq.{alert_id}"})
    return Response(status_code=204)
