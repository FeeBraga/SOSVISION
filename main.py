import cv2
import numpy as np

import mediapipe as mp

import requests

import time

import threading

import queue
from collections import Counter, deque

import math

import base64

from datetime import datetime

import os

from dotenv import load_dotenv

from gesture_detection import reconhecer_gesto as reconhecer_gesto_compartilhado


# Carrega variáveis do arquivo .env

load_dotenv()





# ============================================================

# SOS VISION

# ============================================================

#

# ✌️  2 dedos  -> PERDIDO

# ✊  PUNHO    -> ACIDENTE

# 🖐️  MÃO ABERTA -> SEQUESTRO / COAÇÃO

#

# Após confirmação:

#

# 1. Identifica o tipo de emergência

# 2. Registra data e horário

# 3. Consulta localização aproximada pelo IP

# 4. Gera link do Google Maps

# 5. Envia alerta pelo CallMeBot

# 6. Envia alerta para o painel web

#

# ============================================================





# ============================================================

# CONFIGURAÇÃO DO CALLMEBOT

# ============================================================



CALLMEBOT_PHONE = os.getenv("CALLMEBOT_PHONE")

CALLMEBOT_APIKEY = os.getenv("CALLMEBOT_APIKEY")



# False = envia WhatsApp

# True  = apenas mostra no terminal



MODO_TESTE = os.getenv("MODO_TESTE", "False").lower() == "true"





# ============================================================

# CONFIGURAÇÃO DO PAINEL WEB

# ============================================================



PAINEL_WEB_URL = os.getenv("PAINEL_WEB_URL", "http://localhost:8000/api/alertas")

PAINEL_WEB_ATIVO = os.getenv("PAINEL_WEB_ATIVO", "True").lower() == "true"  # True = envia para painel, False = desativado



# Identificação da câmera

CAMERA_ID = os.getenv("CAMERA_ID", "camera_local_01")  # Usado para identificar qual câmera enviou o alerta

# Stream MJPEG opcional para execução local; configure fora do código.
CAMERA_STREAM_URL = os.getenv("CAMERA_STREAM_URL", "")






# ============================================================

# CONFIGURAÇÃO DA GOOGLE MAPS GEOLOCATION API

# ============================================================



GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")  # Chave da Google

USAR_GOOGLE_GEOLOCATION = os.getenv("USAR_GOOGLE_GEOLOCATION", "True").lower() == "true"  # True = usa Google, False = usa ipapi.co (gratuito)

# OBS: Geolocation API agora está habilitada no Google Cloud Console





# ============================================================

# TIPOS DE ALERTA

# ============================================================



GESTO_PERDIDO = "PERDIDO"

GESTO_ACIDENTE = "ACIDENTE"

GESTO_SEQUESTRO = "SEQUESTRO"





# ============================================================

# CONFIGURAÇÕES

# ============================================================



# Tempo que o gesto precisa ficar visível



TEMPO_CONFIRMACAO = 1.5



# Tempo mínimo entre alertas



COOLDOWN = 10

# Buffer de um único frame: a análise sempre recebe a imagem mais recente,
# em vez de acumular atraso quando o MediaPipe processa mais devagar que o stream.
FILA_FRAMES_MAXIMA = 1

# Fila de alertas separada do loop da câmera. Os workers fazem o envio
# bloqueante enquanto a captura continua lendo e identificando frames.
FILA_ALERTAS_MAXIMA = 12
TRABALHADORES_ALERTAS = 3
fila_alertas = queue.Queue(maxsize=FILA_ALERTAS_MAXIMA)
lock_estado_alertas = threading.Lock()
alertas_em_processamento = 0
ultimo_log_fila = 0.0


def trabalhador_alertas(indice):
    """Processa alertas da fila sem bloquear o loop principal da câmera."""
    while True:
        item = fila_alertas.get()
        try:
            tipo, frame, numero = item
            global alertas_em_processamento
            with lock_estado_alertas:
                alertas_em_processamento += 1
                processando = alertas_em_processamento
            print(
                f"[FILA] Alerta {numero} iniciou | "
                f"aguardando={fila_alertas.qsize()} | "
                f"processando={processando}/{TRABALHADORES_ALERTAS}"
            )
            print(f"[Alerta {numero}] Iniciando envio ({tipo}) - worker {indice}")
            enviar_alerta(tipo, frame)
            print(f"[Alerta {numero}] Envio concluído")
        except Exception as erro:
            print(f"[Alerta] Falha no worker {indice}: {erro}")
        finally:
            with lock_estado_alertas:
                alertas_em_processamento -= 1
            fila_alertas.task_done()


def iniciar_trabalhadores_alertas():
    for indice in range(1, TRABALHADORES_ALERTAS + 1):
        threading.Thread(
            target=trabalhador_alertas,
            args=(indice,),
            name=f"alerta-worker-{indice}",
            daemon=True
        ).start()


def enfileirar_alerta(tipo, frame, numero):
    """Coloca uma cópia independente na fila sem bloquear a câmera."""
    try:
        fila_alertas.put_nowait((tipo, frame.copy(), numero))
        print(
            f"[Alerta {numero}] Colocado na fila "
            f"({fila_alertas.qsize()}/{FILA_ALERTAS_MAXIMA}) | "
            f"processando={alertas_em_processamento}/{TRABALHADORES_ALERTAS}"
        )
        return True
    except queue.Full:
        print(
            f"[Alerta {numero}] Fila cheia: alerta não enfileirado "
            "para preservar a captura da câmera."
        )
        return False


iniciar_trabalhadores_alertas()






# ============================================================

# FUNÇÃO PARA ENVIAR ALERTA PARA O PAINEL WEB

# ============================================================



def enviar_alerta_para_painel(tipo, mensagem, cidade, regiao, pais="Brasil", latitude=None, longitude=None, mapa=None, ip=None, snapshot=None, camera_id=None):

    """Envia alerta do SOS Vision para o painel web"""

    if not PAINEL_WEB_ATIVO:

        return



    try:

        # Usar horário local de Brasília diretamente (sem conversão UTC)

        from datetime import timezone, timedelta

        brasilia_tz = timezone(timedelta(hours=-3))

        data_hora_local = datetime.now(brasilia_tz)



        payload = {

            "tipo": tipo,

            "mensagem": mensagem,

            "data_hora": data_hora_local.isoformat(),

            "cidade": cidade,

            "regiao": regiao,

            "pais": pais,

            "latitude": latitude,

            "longitude": longitude,

            "mapa": mapa,

            "ip": ip,

            "snapshot": snapshot,

            "camera_id": camera_id or CAMERA_ID

        }



        response = requests.post(PAINEL_WEB_URL, json=payload, timeout=5)



        if response.status_code == 200:

            print("✅ Alerta enviado para o painel web!")

        else:

            print(f"❌ Erro ao enviar para painel: {response.status_code}")



    except Exception as e:

        print(f"❌ Erro de conexão com painel: {e}")





# ============================================================

# DISTÂNCIA ENTRE DOIS PONTOS DA MÃO

# ============================================================



def distancia(pontos, ponto1, ponto2):



    x1 = pontos[ponto1].x

    y1 = pontos[ponto1].y

    z1 = pontos[ponto1].z



    x2 = pontos[ponto2].x

    y2 = pontos[ponto2].y

    z2 = pontos[ponto2].z



    return math.sqrt(

        (x1 - x2) ** 2 +

        (y1 - y2) ** 2 +

        (z1 - z2) ** 2

    )


def angulo_articulacao(pontos, ponto1, articulacao, ponto2):
    """Calcula o ângulo 3D de uma articulação a partir de três landmarks."""
    a = pontos[ponto1]
    b = pontos[articulacao]
    c = pontos[ponto2]
    vetor1 = (a.x - b.x, a.y - b.y, a.z - b.z)
    vetor2 = (c.x - b.x, c.y - b.y, c.z - b.z)
    produto = sum(x * y for x, y in zip(vetor1, vetor2))
    norma1 = math.sqrt(sum(x * x for x in vetor1))
    norma2 = math.sqrt(sum(x * x for x in vetor2))
    if norma1 == 0 or norma2 == 0:
        return 0.0
    cosseno = max(-1.0, min(1.0, produto / (norma1 * norma2)))
    return math.degrees(math.acos(cosseno))





# ============================================================

# DETECÇÃO DOS DEDOS

# ============================================================



def dedos_levantados(hand):
    """Detecta dedos estendidos sem depender de a mão estar em pé ou invertida."""
    pontos = hand.landmark
    dedos = [(5, 6, 8), (9, 10, 12), (13, 14, 16), (17, 18, 20)]
    return [
        angulo_articulacao(pontos, mcp, pip, ponta) >= 140
        and distancia(pontos, ponta, 0) > distancia(pontos, pip, 0) * 1.02
        for mcp, pip, ponta in dedos
    ]








# ============================================================

# RECONHECIMENTO DOS GESTOS

# ============================================================



def reconhecer_gesto(hand):
    return reconhecer_gesto_compartilhado(hand)


# OBTER LOCALIZAÇÃO PELO IP (ip-api.com - GRATUITO)

# ============================================================



def obter_localizacao_ipapi():

    """Obtém localização usando ip-api.com (gratuito)"""



    print("\n📍 Obtendo localização aproximada (ip-api.com)...")



    try:



        resposta = requests.get(

            "http://ip-api.com/json/",

            timeout=5

        )



        resposta.raise_for_status()



        dados = resposta.json()



        cidade = dados.get(

            "city",

            "Desconhecida"

        )



        regiao = dados.get(

            "regionName",

            "Desconhecida"

        )



        pais = dados.get(

            "country",

            "Desconhecida"

        )



        latitude = dados.get(

            "lat"

        )



        longitude = dados.get(

            "lon"

        )



        ip = dados.get(

            "query"

        )



        print("IP:", ip)

        print("Cidade:", cidade)

        print("Região:", regiao)

        print("País:", pais)

        print("Latitude:", latitude)

        print("Longitude:", longitude)



        return cidade, regiao, pais, latitude, longitude, ip



    except Exception as e:

        print(f"⚠️ Não foi possível obter localização.")

        print(f"Erro: {e}")

        return "Desconhecida", "Desconhecida", "Desconhecida", None, None, None





# ============================================================

# OBTER LOCALIZAÇÃO USANDO GOOGLE MAPS GEOLOCATION API

# ============================================================



def obter_localizacao_google():

    """Obtém localização usando Google Maps Geolocation API (requer chave)"""



    print("\n📍 Obtendo localização precisa (Google Maps Geolocation)...")



    try:

        # Primeiro, obtém o IP para usar como parâmetro

        ip_response = requests.get("https://api.ipify.org?format=json", timeout=5)

        ip_response.raise_for_status()

        ip = ip_response.json().get("ip")



        # Usa a Google Geolocation API

        geocode_url = f"https://www.googleapis.com/geolocation/v1/geolocate?key={GOOGLE_API_KEY}"



        payload = {

            "considerIp": True,

            "ip": ip

        }



        resposta = requests.post(

            geocode_url,

            json=payload,

            timeout=10

        )



        resposta.raise_for_status()



        dados = resposta.json()



        location = dados.get("location", {})

        latitude = location.get("lat")

        longitude = location.get("lng")

        accuracy = location.get("accuracy")



        # Usa Reverse Geocoding para obter cidade/região

        if latitude and longitude:

            geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={latitude},{longitude}&key={GOOGLE_API_KEY}"

            geocode_response = requests.get(geocode_url, timeout=5)

            geocode_response.raise_for_status()

            geocode_data = geocode_response.json()



            if geocode_data.get("results"):

                address_components = geocode_data["results"][0].get("address_components", [])



                cidade = "Desconhecida"

                regiao = "Desconhecida"

                pais = "Desconhecida"



                for component in address_components:

                    types = component.get("types", [])

                    if "locality" in types or "administrative_area_level_2" in types:

                        cidade = component.get("long_name", cidade)

                    elif "administrative_area_level_1" in types:

                        regiao = component.get("long_name", regiao)

                    elif "country" in types:

                        pais = component.get("long_name", pais)

            else:

                cidade = "Desconhecida"

                regiao = "Desconhecida"

                pais = "Desconhecida"

        else:

            cidade = "Desconhecida"

            regiao = "Desconhecida"

            pais = "Desconhecida"



        print("IP:", ip)

        print("Cidade:", cidade)

        print("Região:", regiao)

        print("País:", pais)

        print("Latitude:", latitude)

        print("Longitude:", longitude)

        print("Precisão:", accuracy, "metros")



        return cidade, regiao, pais, latitude, longitude, ip



    except Exception as e:

        print(f"⚠️ Não foi possível obter localização com Google Maps.")

        print(f"Erro: {e}")

        print("⚠️ Recaindo para ipapi.co (gratuito)...")

        return obter_localizacao_ipapi()





# ============================================================

# OBTER LOCALIZAÇÃO (GERAL)

# ============================================================



def obter_localizacao():

    """Obtém localização usando Google ou ipapi.co"""



    if USAR_GOOGLE_GEOLOCATION and GOOGLE_API_KEY != "sua_chave_aqui":

        return obter_localizacao_google()

    else:

        return obter_localizacao_ipapi()





# ============================================================

# ENVIA ALERTA

# ============================================================



def enviar_alerta(tipo, frame=None):



    # --------------------------------------------------------

    # CAPTURA SNAPSHOT DO FRAME

    # --------------------------------------------------------



    snapshot = None

    if frame is not None:

        try:

            # Redimensiona para reduzir tamanho (max 640px de largura)

            height, width = frame.shape[:2]

            if width > 640:

                ratio = 640 / width

                new_height = int(height * ratio)

                frame = cv2.resize(frame, (640, new_height))



            # Converte frame para base64 com compressão (qualidade 70%)

            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])

            snapshot = base64.b64encode(buffer).decode('utf-8')

            print(f"✅ Snapshot capturado ({len(snapshot)} caracteres)")

        except Exception as e:

            print(f"⚠️ Erro ao capturar snapshot: {e}")



    # --------------------------------------------------------

    # MENSAGENS

    # --------------------------------------------------------



    mensagens = {



        GESTO_PERDIDO:



            "🚨 ALERTA SOS\n"

            "Tipo: POSSIVEL SITUACAO DE PERDA/DESORIENTACAO.\n"

            "O sistema detectou um pedido de ajuda.",



        GESTO_ACIDENTE:



            "🚨 ALERTA SOS\n"

            "Tipo: POSSIVEL ACIDENTE.\n"

            "O sistema detectou um pedido de ajuda.",



        GESTO_SEQUESTRO:



            "🚨 ALERTA SOS\n"

            "Tipo: POSSIVEL SEQUESTRO/COACAO.\n"

            "O sistema detectou um pedido de ajuda."

    }





    mensagem_base = mensagens[tipo]





    # --------------------------------------------------------

    # DATA E HORA

    # --------------------------------------------------------



    from datetime import timezone, timedelta



    # Usar UTC para salvar no banco (padrão)

    agora = datetime.now(timezone.utc)



    # Para exibição local, converter para Brasília

    brasilia_tz = timezone(timedelta(hours=-3))

    agora_local = agora.astimezone(brasilia_tz)



    data_hora = agora_local.strftime(

        "%d/%m/%Y %H:%M:%S"

    )





    # --------------------------------------------------------

    # LOCALIZAÇÃO

    # --------------------------------------------------------



    local = obter_localizacao()





    # --------------------------------------------------------

    # MONTA MENSAGEM

    # --------------------------------------------------------



    mensagem = (



        f"{mensagem_base}\n\n"



        f"🕐 Horario: {data_hora}\n"

    )





    if local and local[0] != "Desconhecida":



        cidade = local[0]

        regiao = local[1]

        pais = local[2]

        latitude = local[3]

        longitude = local[4]

        ip = local[5]



        mensagem += (



            f"\n📍 Localizacao aproximada:\n"



            f"{cidade} - {regiao}, {pais}\n"

        )





        if latitude is not None and longitude is not None:



            mensagem += (



                f"\n🧭 Coordenadas aproximadas:\n"



                f"{latitude}, "

                f"{longitude}\n"

            )





        if latitude is not None and longitude is not None:



            mapa = f"https://www.google.com/maps?q={latitude},{longitude}"

            mensagem += (



                f"\n🗺️ Ver no Google Maps:\n"



                f"{mapa}\n"

            )





    else:



        mensagem += (



            "\n📍 Localizacao: "

            "nao disponivel no momento.\n"

        )





    # --------------------------------------------------------

    # TERMINAL

    # --------------------------------------------------------



    print()



    print(

        "=============================="

    )



    print(

        "🚨 ALERTA DISPARADO"

    )



    print(

        "=============================="

    )



    print(

        "Tipo:",

        tipo

    )



    print(

        "Horario:",

        data_hora

    )



    print()



    print(

        mensagem

    )



    print(

        "=============================="

    )



    print()





    # --------------------------------------------------------

    # MODO TESTE

    # --------------------------------------------------------



    if MODO_TESTE:



        print(

            "⚠️ MODO TESTE: "

            "WhatsApp nao enviado."

        )



        # Ainda envia para o painel web em modo teste

        if local and local[0] != "Desconhecida":

            cidade = local[0]

            regiao = local[1]

            pais = local[2]

            latitude = local[3]

            longitude = local[4]

            ip = local[5]

            mapa = f"https://www.google.com/maps?q={latitude},{longitude}" if latitude and longitude else None



            enviar_alerta_para_painel(

                tipo=tipo,

                mensagem=mensagem_base,

                cidade=cidade,

                regiao=regiao,

                pais=pais,

                latitude=latitude,

                longitude=longitude,

                mapa=mapa,

                ip=ip,

                snapshot=snapshot,

                camera_id=CAMERA_ID

            )

        else:

            enviar_alerta_para_painel(

                tipo=tipo,

                mensagem=mensagem_base,

                cidade="Desconhecida",

                regiao="Desconhecida",

                pais="Desconhecida",

                latitude=None,

                longitude=None,

                mapa=None,

                ip=None,

                snapshot=snapshot,

                camera_id=CAMERA_ID

            )



        return





    # --------------------------------------------------------

    # CALLMEBOT

    # --------------------------------------------------------



    url = (

        "https://api.callmebot.com/"

        "whatsapp.php"

    )





    parametros = {



        "phone": CALLMEBOT_PHONE,



        "text": mensagem,



        "apikey": CALLMEBOT_APIKEY

    }





    try:



        print(

            "📱 Enviando alerta pelo WhatsApp..."

        )





        resposta = requests.get(



            url,



            params=parametros,



            timeout=10

        )





        print(

            "CallMeBot:",

            resposta.status_code

        )





        print(

            resposta.text

        )





        if resposta.status_code == 200:



            print(

                "✅ Alerta enviado!"

            )



        else:



            print(

                "⚠️ CallMeBot retornou "

                "um status diferente de 200."

            )





    except Exception as erro:



        print(

            "❌ Erro ao enviar alerta:"

        )



        print(

            erro

        )



    # --------------------------------------------------------

    # ENVIAR PARA O PAINEL WEB (independente do WhatsApp)

    # --------------------------------------------------------



    if local and local[0] != "Desconhecida":

        cidade = local[0]

        regiao = local[1]

        pais = local[2]

        latitude = local[3]

        longitude = local[4]

        ip = local[5]

        mapa = f"https://www.google.com/maps?q={latitude},{longitude}" if latitude and longitude else None



        enviar_alerta_para_painel(

            tipo=tipo,

            mensagem=mensagem_base,

            cidade=cidade,

            regiao=regiao,

            pais=pais,

            latitude=latitude,

            longitude=longitude,

            mapa=mapa,

            ip=ip,

            snapshot=snapshot,

            camera_id=CAMERA_ID

        )

    else:

        enviar_alerta_para_painel(

            tipo=tipo,

            mensagem=mensagem_base,

            cidade="Desconhecida",

            regiao="Desconhecida",

            pais="Desconhecida",

            latitude=None,

            longitude=None,

            mapa=None,

            ip=None,

            snapshot=snapshot,

            camera_id=CAMERA_ID

        )





# ============================================================

# PROGRAMA PRINCIPAL

# ============================================================




# ============================================================
# LEITURA DE FRAMES JPEG DO STREAM MJPEG
# ============================================================

def ler_frame_stream(resposta, buffer_camera):
    """Extrai um JPEG do stream MJPEG e devolve um frame OpenCV."""
    while True:
        inicio = buffer_camera.find(b"\xff\xd8")
        fim = buffer_camera.find(b"\xff\xd9", inicio + 2) if inicio != -1 else -1

        if inicio != -1 and fim != -1:
            jpeg = bytes(buffer_camera[inicio:fim + 2])
            del buffer_camera[:fim + 2]
            frame = cv2.imdecode(
                np.frombuffer(jpeg, dtype=np.uint8),
                cv2.IMREAD_COLOR
            )
            if frame is not None:
                return frame
            continue

        if len(buffer_camera) > 2_000_000:
            del buffer_camera[:-100_000]

        bloco = resposta.raw.read(4096)
        if not bloco:
            return None
        buffer_camera.extend(bloco)


def capturar_frames_recentes(resposta, buffer_camera, fila_frames, encerrar):
    """Consome o MJPEG continuamente e descarta quadros antigos sob carga."""
    try:
        while not encerrar.is_set():
            frame = ler_frame_stream(resposta, buffer_camera)
            if frame is None:
                break

            if fila_frames.full():
                try:
                    fila_frames.get_nowait()
                except queue.Empty:
                    pass
            try:
                fila_frames.put_nowait(frame)
            except queue.Full:
                pass
    except requests.RequestException as erro:
        if not encerrar.is_set():
            print(f"❌ Falha ao receber o stream da câmera: {erro}")
    finally:
        while True:
            try:
                fila_frames.get_nowait()
            except queue.Empty:
                break
        fila_frames.put(None)


def main():



    # --------------------------------------------------------

    # MEDIAPIPE

    # --------------------------------------------------------



    mp_hands = mp.solutions.hands



    hands = mp_hands.Hands(



        static_image_mode=False,



        max_num_hands=1,
        min_detection_confidence=0.55,
        min_tracking_confidence=0.5

    )





    # --------------------------------------------------------

    # CONEXÃO COM ESP32-S3 CAM
    # --------------------------------------------------------
    print("Conectando ao ESP32-S3 CAM...")
    print("Stream:", CAMERA_STREAM_URL)

    try:
        camera = requests.get(
            CAMERA_STREAM_URL,
            stream=True,
            timeout=(5, 15)
        )
        camera.raise_for_status()
        camera.raw.decode_content = False
        buffer_camera = bytearray()
        print("✅ ESP32-S3 CAM conectado. Recebendo imagens...")
    except requests.RequestException as erro:
        print("❌ Não foi possível conectar ao ESP32-S3 CAM:")
        print(erro)
        return

    fila_frames = queue.Queue(maxsize=FILA_FRAMES_MAXIMA)
    encerrar_leitura = threading.Event()
    leitor_frames = threading.Thread(
        target=capturar_frames_recentes,
        args=(camera, buffer_camera, fila_frames, encerrar_leitura),
        name="leitor-frames-camera",
        daemon=True,
    )
    leitor_frames.start()

    # VARIÁVEIS

    # --------------------------------------------------------



    gesto_atual = None
    inicio_gesto = None
    alerta_gesto_enviado = False
    gestos_recentes = deque(maxlen=5)

    ultimo_alerta = time.monotonic() - COOLDOWN
    numero_alerta = 0
    ultimo_log_gesto = 0.0
    ultimo_log_fila_local = 0.0





    # --------------------------------------------------------

    # INFORMAÇÕES

    # --------------------------------------------------------



    print()



    print(

        "===================================="

    )



    print(

        "      SOS VISION - Gesto de emergencia"

    )



    print(

        "===================================="

    )



    print()



    print(

        "✌️  2 dedos  = PERDIDO"

    )



    print(

        "✊  Punho fechado = ACIDENTE"

    )



    print(

        "🖐️ Mao aberta = SEQUESTRO/COACAO"

    )



    print()



    print(

        f"Confirmação: "

        f"{TEMPO_CONFIRMACAO}s"

    )



    print(

        f"Cooldown: "

        f"{COOLDOWN}s"

    )



    print()



    print(

        "ESC = sair"

    )



    print(

        "===================================="

    )



    print()





    # ========================================================

    # LOOP PRINCIPAL

    # ========================================================



    while True:



        try:
            frame = fila_frames.get(timeout=20)
        except queue.Empty:
            print("❌ O stream da câmera não enviou frames por 20 segundos.")
            break
        if frame is None:
            print("❌ A transmissão do ESP32-S3 CAM foi encerrada.")
            break

        frame_alerta = frame.copy()




        # A orientação já é corrigida no sensor OV5640 (180 graus).
        # Não espelhar novamente aqui, pois isso inverteria a leitura.

        # ----------------------------------------------------

        # BGR -> RGB

        # ----------------------------------------------------



        rgb = cv2.cvtColor(



            frame,



            cv2.COLOR_BGR2RGB

        )





        # ----------------------------------------------------

        # MEDIAPIPE

        # ----------------------------------------------------



        resultado = hands.process(

            rgb

        )





        gesto_candidato = None
        if resultado.multi_hand_landmarks:
            gesto_candidato = reconhecer_gesto(resultado.multi_hand_landmarks[0])

        gestos_recentes.append(gesto_candidato)
        votos = Counter(gesto for gesto in gestos_recentes if gesto is not None)
        gesto_detectado = next(
            (gesto for gesto, quantidade in votos.most_common(1) if quantidade >= 3),
            None,
        )





        # ====================================================

        # CONTROLE DO GESTO

        # ====================================================



        if gesto_detectado:



            # ------------------------------------------------

            # NOVO GESTO

            # ------------------------------------------------



            if gesto_atual != gesto_detectado:



                gesto_atual = (



                    gesto_detectado

                )



                inicio_gesto = (

                    time.monotonic()

                )
                alerta_gesto_enviado = False
                ultimo_log_gesto = 0.0
                print(
                    f"[LEITURA] Gesto iniciado: {gesto_detectado} | "
                    f"confirmacao em {TEMPO_CONFIRMACAO:.1f}s"
                )





            # ------------------------------------------------

            # MESMO GESTO

            # ------------------------------------------------



            else:



                tempo = (



                    time.monotonic()



                    - inicio_gesto

                )

                if tempo - ultimo_log_gesto >= 0.25:
                    restante = max(0.0, TEMPO_CONFIRMACAO - tempo)
                    print(
                        f"[LEITURA] {gesto_detectado} | "
                        f"tempo={tempo:.2f}/{TEMPO_CONFIRMACAO:.2f}s | "
                        f"restante={restante:.2f}s | "
                        f"fila={fila_alertas.qsize()}/{FILA_ALERTAS_MAXIMA} | "
                        f"processando={alertas_em_processamento}/{TRABALHADORES_ALERTAS}"
                    )
                    ultimo_log_gesto = tempo





                # --------------------------------------------

                # PROGRESSO

                # --------------------------------------------



                cv2.putText(



                    frame,



                    (

                        f"{'ALERTA ENVIADO' if alerta_gesto_enviado else gesto_detectado} "

                        f"- {tempo:.1f}s"

                    ),



                    (30, 50),



                    cv2.FONT_HERSHEY_SIMPLEX,



                    0.9,



                    (0, 255, 255),



                    2

                )





                # --------------------------------------------

                # BARRA DE PROGRESSO

                # --------------------------------------------



                progresso = min(



                    tempo /

                    TEMPO_CONFIRMACAO,



                    1.0

                )



                largura_barra = int(



                    400 *

                    progresso

                )



                cv2.rectangle(



                    frame,

                    (30, 70),

                    (430, 100),

                    (80, 80, 80),

                    2

                )



                cv2.rectangle(



                    frame,

                    (30, 70),

                    (

                        30 + largura_barra,

                        100

                    ),

                    (0, 255, 255),

                    -1

                )





                # --------------------------------------------

                # CONFIRMA ALERTA

                # --------------------------------------------



                if (



                    tempo >=

                    TEMPO_CONFIRMACAO
                    and not alerta_gesto_enviado


                    and

                    time.monotonic()

                    - ultimo_alerta

                    >= COOLDOWN



                ):



                    # O envio pode fazer snapshot, geolocalizacao e varias
                    # requisicoes HTTP. Enfileirar sem bloquear a leitura
                    # do MJPEG; os workers processam os alertas com controle.
                    print(
                        f"[LEITURA] CONFIRMADO em {tempo:.2f}s | "
                        f"fila antes={fila_alertas.qsize()}/{FILA_ALERTAS_MAXIMA} | "
                        f"processando={alertas_em_processamento}/{TRABALHADORES_ALERTAS}"
                    )
                    numero_alerta += 1
                    if enfileirar_alerta(gesto_detectado, frame_alerta, numero_alerta):
                        ultimo_alerta = time.monotonic()
                        alerta_gesto_enviado = True




        # ====================================================
        # NENHUM GESTO

        # ====================================================



        else:



            gesto_atual = None



            inicio_gesto = None
            alerta_gesto_enviado = False



            cv2.putText(



                frame,

                "Aguardando gesto...",



                (30, 50),



                cv2.FONT_HERSHEY_SIMPLEX,

                0.9,

                (255, 255, 255),

                2

            )





        cv2.imshow(

            "SOS VISION - Gesto de emergencia",

            frame

        )



        # ====================================================

        # SAIR

        # ====================================================



        if cv2.waitKey(

            1

        ) & 0xFF == 27:



            break





    # ========================================================

    # FINALIZAÇÃO

    # ========================================================



    encerrar_leitura.set()
    camera.close()
    leitor_frames.join(timeout=2)
    hands.close()

    cv2.destroyAllWindows()





if __name__ == "__main__":



    main()
