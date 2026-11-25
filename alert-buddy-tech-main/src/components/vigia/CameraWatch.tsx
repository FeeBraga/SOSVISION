import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, CameraOff, Crosshair, Loader2, ScanEye } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { analyzeFrame } from "@/lib/vision.functions";
import { KIND_LABEL, type WebAlert } from "@/lib/alerts";

type Coords = { lat: number; lng: number; accuracy: number } | null;

export function CameraWatch({ onAlert }: { onAlert: (alert: WebAlert) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyze = useServerFn(analyzeFrame);

  const [active, setActive] = useState(false);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<Coords>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [lastVerdict, setLastVerdict] = useState<string | null>(null);

  const coordsRef = useRef<Coords>(null);
  coordsRef.current = coords;
  const busyRef = useRef(false);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoError("Este dispositivo não expõe GPS ao navegador.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => setGeoError(err.message || "Permissão de localização negada."),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      toast.success("Câmera ativa — vigilância iniciada");
    } catch {
      toast.error("Não foi possível acessar a câmera. Verifique a permissão.");
    }
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 720 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, []);

  const runAnalysis = useCallback(async () => {
    if (busyRef.current) return;
    const frame = capture();
    if (!frame) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const verdict = await analyze({ data: { imageDataUrl: frame } });
      setLastCheck(new Date().toLocaleTimeString("pt-BR"));
      setLastVerdict(
        verdict.detected
          ? `${KIND_LABEL[verdict.kind as keyof typeof KIND_LABEL]} · ${Math.round(verdict.confidence * 100)}%`
          : "Nenhum sinal de emergência",
      );

      if (!verdict.detected || verdict.kind === "nenhum") return;

      const position = coordsRef.current;
      const alert: WebAlert = {
        id: `cam-${Date.now()}`,
        kind: verdict.kind,
        severity: verdict.severity,
        status: "novo",
        title: verdict.title,
        summary: verdict.summary,
        source: "Câmera do dispositivo",
        sourceUrl: "#",
        city: position ? "Minha localização" : "Localização indisponível",
        state: "GPS",
        lat: position?.lat ?? 0,
        lng: position?.lng ?? 0,
        detectedAt: new Date().toISOString(),
        confidence: verdict.confidence,
        keywords: ["detecção por câmera"],
      };
      onAlert(alert);
      toast.error(`${KIND_LABEL[verdict.kind]} detectado pela câmera`, {
        description: verdict.title,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao analisar o frame");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [analyze, capture, onAlert]);

  useEffect(() => {
    if (!active || !auto) return;
    const id = setInterval(() => void runAnalysis(), 10_000);
    return () => clearInterval(id);
  }, [active, auto, runAnalysis]);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ScanEye className="size-4 text-primary" /> Vigilância por câmera
        </h2>
        <span
          className={cn(
            "ml-auto rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
            active
              ? "border-success/40 bg-success/10 text-success"
              : "border-border bg-secondary text-muted-foreground",
          )}
        >
          {active ? (busy ? "Analisando frame…" : "Monitorando") : "Câmera desligada"}
        </span>
      </div>

      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-md border border-border bg-sidebar">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn("size-full object-cover", !active && "opacity-0")}
        />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="size-6" />
            <p className="text-xs">Ative a câmera para iniciar a detecção</p>
          </div>
        )}
        {busy && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[11px]">
            <Loader2 className="size-3 animate-spin" /> IA analisando
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {active ? (
          <Button size="sm" variant="outline" onClick={stopCamera}>
            <CameraOff className="size-4" /> Desligar
          </Button>
        ) : (
          <Button size="sm" onClick={() => void startCamera()}>
            <Camera className="size-4" /> Ativar câmera
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!active || busy}
          onClick={() => void runAnalysis()}
        >
          Analisar agora
        </Button>
        <Button size="sm" variant={auto ? "default" : "outline"} onClick={() => setAuto((a) => !a)}>
          {auto ? "Auto a cada 10s" : "Auto desligado"}
        </Button>
      </div>

      <div className="mt-4 space-y-1.5 text-[11px] text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Crosshair className="size-3" />
          {coords
            ? `GPS ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} (±${coords.accuracy} m)`
            : (geoError ?? "Obtendo localização do dispositivo…")}
        </p>
        {lastCheck && (
          <p>
            Última análise às {lastCheck} — {lastVerdict}
          </p>
        )}
      </div>
    </div>
  );
}
