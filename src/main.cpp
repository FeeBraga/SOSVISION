
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include <cstring>
#include <cstdio>
#include <time.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Missing include/secrets.h. Copy include/secrets.example.h and configure it locally."
#endif

// ==========================================
// CONFIGURACAO WI-FI
// ==========================================

static const char* ssid = SOS_WIFI_SSID;
static const char* password = SOS_WIFI_PASSWORD;
static bool localServersStarted = false;
static unsigned long lastWifiAttempt = 0;
static constexpr unsigned long FRAME_INTERVAL_MS = 250UL;
static constexpr unsigned long MAX_CLOUD_FRAME_BYTES = 2000000UL;
static unsigned long nextCloudAttemptAt = 0;
static unsigned long cloudRetryDelayMs = 1000UL;
static bool timeSyncStarted = false;
static unsigned long lastTimeSyncMessage = 0;


// ==========================================
// PINOS DA OV5640 - ESP32-S3
// MANTIDOS DA CONFIGURACAO TESTADA
// ==========================================

#define PWDN_GPIO_NUM  -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  15
#define SIOD_GPIO_NUM  4
#define SIOC_GPIO_NUM  5

#define Y9_GPIO_NUM    16
#define Y8_GPIO_NUM    17
#define Y7_GPIO_NUM    18
#define Y6_GPIO_NUM    12
#define Y5_GPIO_NUM    10
#define Y4_GPIO_NUM    8
#define Y3_GPIO_NUM    9
#define Y2_GPIO_NUM    11

#define VSYNC_GPIO_NUM 6
#define HREF_GPIO_NUM  7
#define PCLK_GPIO_NUM  13

// ==========================================
// SERVIDORES HTTP
// ==========================================

static httpd_handle_t page_httpd = nullptr;
static httpd_handle_t stream_httpd = nullptr;
static httpd_handle_t stream2_httpd = nullptr;
static httpd_handle_t stream3_httpd = nullptr;

// ==========================================
// PAGINA PRINCIPAL
// ==========================================

static const char INDEX_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html>
<html lang="pt-BR">

<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>Camera OV5640</title>

<style>
body {
    margin: 0;
    padding: 20px;
    text-align: center;
    font-family: Arial, sans-serif;
    color: #f8fafc;
    background: #101827;
}

main {
    max-width: 1000px;
    margin: auto;
}

img {
    display: block;
    width: 100%;
    height: auto;
    background: #000;
    border-radius: 12px;
}

button {
    padding: 12px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
}
</style>

</head>

<body>

<main>

<h2>Camera OV5640</h2>

<p>ESP32-S3 - video ao vivo</p>

<img id="camera-stream" alt="Video da camera">

<script>
document.getElementById("camera-stream").src =
    `${window.location.protocol}//${window.location.hostname}:83/stream`;
</script>

<p>Se a imagem parar, atualize a pagina.</p>

<button onclick="location.reload()">
Reconectar
</button>

</main>

</body>
</html>
)HTML";

// ==========================================
// ROTA PRINCIPAL
// PORTA 80
// ==========================================

static esp_err_t index_handler(httpd_req_t *req) {

    Serial0.println("Requisicao recebida: /");

    httpd_resp_set_type(
        req,
        "text/html; charset=utf-8"
    );

    httpd_resp_set_hdr(
        req,
        "Cache-Control",
        "no-store"
    );

    return httpd_resp_send(
        req,
        INDEX_HTML,
        HTTPD_RESP_USE_STRLEN
    );
}

// ==========================================
// STREAM MJPEG
// PORTA 81
// ==========================================

static esp_err_t stream_handler(httpd_req_t *req) {

    static const char* STREAM_TYPE =
        "multipart/x-mixed-replace;boundary=frame";

    static const char* BOUNDARY =
        "\r\n--frame\r\n";

    static const char* PART_HEADER =
        "Content-Type: image/jpeg\r\n"
        "Content-Length: %u\r\n\r\n";

    esp_err_t res = httpd_resp_set_type(
        req,
        STREAM_TYPE
    );

    if (res != ESP_OK) {
        return res;
    }

    httpd_resp_set_hdr(
        req,
        "Access-Control-Allow-Origin",
        "*"
    );

    httpd_resp_set_hdr(
        req,
        "Cache-Control",
        "no-store"
    );

    char header[64];

    Serial0.println("Cliente conectado ao stream");

    while (true) {

        camera_fb_t *fb = esp_camera_fb_get();

        if (fb == nullptr) {

            Serial0.println("Falha na captura da camera");

            return ESP_FAIL;
        }

        if (fb->format != PIXFORMAT_JPEG) {

            esp_camera_fb_return(fb);

            Serial0.println("Formato de imagem invalido");

            return ESP_FAIL;
        }

        // Envia separador do frame
        res = httpd_resp_send_chunk(
            req,
            BOUNDARY,
            strlen(BOUNDARY)
        );

        // Envia cabecalho JPEG
        if (res == ESP_OK) {

            int hlen = snprintf(
                header,
                sizeof(header),
                PART_HEADER,
                static_cast<unsigned int>(fb->len)
            );

            res = httpd_resp_send_chunk(
                req,
                header,
                hlen
            );
        }

        // Envia imagem
        if (res == ESP_OK) {

            res = httpd_resp_send_chunk(
                req,
                reinterpret_cast<const char*>(fb->buf),
                fb->len
            );
        }

        // Libera buffer da camera
        esp_camera_fb_return(fb);

        // Cliente desconectou ou ocorreu erro
        if (res != ESP_OK) {
            break;
        }

        // Libera a CPU por um instante sem acumular quadros atrasados.
        // CAMERA_GRAB_LATEST abaixo garante que a leitura acompanhe o quadro atual.
        vTaskDelay(1);
    }

    Serial0.println("Cliente desconectado do stream");

    return res;
}

// ==========================================
// INICIALIZAR SERVIDOR DA PAGINA
// PORTA 80
// ==========================================

static void startPageServer() {

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();

    config.server_port = 80;
    config.ctrl_port = 32768;
    config.max_uri_handlers = 4;
    config.stack_size = 8192;

    esp_err_t result = httpd_start(
        &page_httpd,
        &config
    );

    if (result != ESP_OK) {

        Serial0.printf(
            "Erro ao iniciar servidor da pagina: %d\n",
            result
        );

        return;
    }

    httpd_uri_t index_uri = {};

    index_uri.uri = "/";
    index_uri.method = HTTP_GET;
    index_uri.handler = index_handler;
    index_uri.user_ctx = nullptr;

    result = httpd_register_uri_handler(
        page_httpd,
        &index_uri
    );

    if (result == ESP_OK) {
        Serial0.println("Rota / registrada com sucesso");
    } else {
        Serial0.printf("Erro ao registrar rota /: %d\n", result);
    }

    Serial0.println("Servidor da pagina iniciado na porta 80");
}

// ==========================================
// INICIALIZAR SERVIDOR DO STREAM
// PORTA 81
// ==========================================

static void startStreamServer(
    httpd_handle_t *server,
    uint16_t port,
    uint16_t controlPort
) {
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();

    config.server_port = port;
    config.ctrl_port = controlPort;
    config.max_uri_handlers = 4;
    config.stack_size = 8192;
    config.max_open_sockets = 4;

    esp_err_t result = httpd_start(server, &config);

    if (result != ESP_OK) {
        Serial0.printf(
            "Erro ao iniciar stream na porta %u: %d\n",
            port,
            result
        );
        return;
    }

    httpd_uri_t stream_uri = {};

    stream_uri.uri = "/stream";
    stream_uri.method = HTTP_GET;
    stream_uri.handler = stream_handler;
    stream_uri.user_ctx = nullptr;

    result = httpd_register_uri_handler(
        *server,
        &stream_uri
    );

    if (result == ESP_OK) {
        Serial0.printf(
            "Stream iniciado na porta %u\n",
            port
        );
    } else {
        Serial0.printf(
            "Erro ao registrar stream na porta %u: %d\n",
            port,
            result
        );
    }
}

static void startLocalServers() {
    startPageServer();
    startStreamServer(&stream_httpd, 81, 32769);
    startStreamServer(&stream2_httpd, 82, 32770);
    startStreamServer(&stream3_httpd, 83, 32771);

    localServersStarted = true;

    Serial0.println("Preview local pronto.");
    Serial0.print("Pagina: http://");
    Serial0.print(WiFi.localIP());
    Serial0.println("/");
    Serial0.print("Stream: http://");
    Serial0.print(WiFi.localIP());
    Serial0.println(":81/stream");
}

// ==========================================
// CONFIGURACAO DA CAMERA
// ==========================================


static bool sendFrameToCloud() {
    if (SOS_API_URL[0] == '\0' || SOS_CAMERA_TOKEN[0] == '\0') {
        Serial0.println("[CLOUD] URL ou TOKEN vazio!");
        return false;
    }

    if (strncmp(SOS_API_URL, "https://", 8) != 0) {
        Serial0.println("[CLOUD] A URL da API precisa usar HTTPS.");
        return false;
    }

    if (WiFi.status() != WL_CONNECTED) {
        Serial0.println("[CLOUD] Wi-Fi desconectado!");
        return false;
    }

    time_t currentTime = 0;
    time(&currentTime);
    if (currentTime < 1700000000) {
        if (millis() - lastTimeSyncMessage >= 10000UL) {
            Serial0.println("[TLS] Aguardando sincronizacao NTP antes da validacao do certificado.");
            lastTimeSyncMessage = millis();
        }
        return false;
    }

    camera_fb_t *fb = esp_camera_fb_get();

    if (!fb) {
        Serial0.println("[CLOUD] Falha ao capturar imagem!");
        return false;
    }

    if (fb->format != PIXFORMAT_JPEG) {
        Serial0.println("[CLOUD] Formato diferente de JPEG!");
        esp_camera_fb_return(fb);
        return false;
    }

    if (fb->len == 0 || fb->len > MAX_CLOUD_FRAME_BYTES) {
        Serial0.printf("[CLOUD] JPEG fora do limite: %u bytes.\n", (unsigned int)fb->len);
        esp_camera_fb_return(fb);
        return false;
    }

    Serial0.printf("[CLOUD] Enviando %u bytes...\n",
                   (unsigned int)fb->len);

    WiFiClientSecure client;
    client.useBuiltinCACertBundle();
    client.setHandshakeTimeout(20);

    HTTPClient http;
    http.setTimeout(15000);
    http.setConnectTimeout(10000);

    if (!http.begin(client, SOS_API_URL)) {
        Serial0.println("[CLOUD] Falha ao iniciar HTTPS!");
        esp_camera_fb_return(fb);
        return false;
    }

    http.addHeader("Content-Type", "image/jpeg");
    http.addHeader(
        "Authorization",
        String("Bearer ") + SOS_CAMERA_TOKEN
    );

    int status = http.POST(fb->buf, fb->len);
    bool sent = false;

    if (status > 0) {
        Serial0.printf("[CLOUD] HTTP: %d\n", status);

        String response = http.getString();
        if (response.length() > 240) {
            response.remove(240);
        }
        Serial0.printf("[CLOUD] Resposta: %s\n", response.c_str());

        if (status >= 200 && status < 300) {
            Serial0.println("[CLOUD] FRAME ENVIADO COM SUCESSO!");
            sent = true;
        } else {
            Serial0.println("[CLOUD] O servidor rejeitou o frame; sera aplicado backoff.");
        }
    } else {
        Serial0.printf(
            "[CLOUD] ERRO HTTPS: %s (%d)\n",
            HTTPClient::errorToString(status).c_str(),
            status
        );
        char tlsError[128] = {};
        const int tlsCode = client.lastError(tlsError, sizeof(tlsError));
        Serial0.printf("[TLS] erro mbedTLS=%d detalhe=%s\n",
                       tlsCode,
                       tlsError[0] ? tlsError : "indisponivel");
    }

    http.end();
    esp_camera_fb_return(fb);
    return sent;
}

// ==========================================
// CONFIGURACAO DA CAMERA
// ==========================================

static bool startCamera() {

    camera_config_t config = {};

    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;

    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;

    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;

    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;

    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;

    config.xclk_freq_hz = 20000000;

    config.pixel_format = PIXFORMAT_JPEG;

    // VGA preserva os detalhes das mãos; qualidade 12 reduz o tamanho dos
    // JPEGs para o stream acompanhar melhor a tela e o reconhecedor.
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 12;

    // Os buffers atendem aos dois clientes; CAMERA_GRAB_LATEST evita que
    // consumidores lentos mantenham quadros antigos acumulados.
    config.fb_count = 3;

    config.grab_mode = CAMERA_GRAB_LATEST;
    config.fb_location = CAMERA_FB_IN_PSRAM;

    esp_err_t err = esp_camera_init(&config);

    if (err != ESP_OK) {

        Serial0.printf(
            "Erro ao inicializar camera: 0x%x\n",
            err
        );

        return false;
    }

    sensor_t *sensor = esp_camera_sensor_get();

    if (sensor != nullptr) {

        // A câmera está montada de cabeça para baixo: aplicar 180 graus
        // no sensor (espelho horizontal + inversão vertical).
        sensor->set_hmirror(sensor, 1);
        sensor->set_vflip(sensor, 1);

        // Limita exposição e ganho para manter contornos quando o LED está
        // no campo da câmera, sem desligar o ajuste automático para locais escuros.
        sensor->set_brightness(sensor, 0);
        sensor->set_contrast(sensor, 0);
        sensor->set_sharpness(sensor, 2);
        sensor->set_saturation(sensor, 1);

        sensor->set_whitebal(sensor, 1);
        sensor->set_awb_gain(sensor, 1);
        sensor->set_wb_mode(sensor, 0);

        sensor->set_exposure_ctrl(sensor, 1);
        sensor->set_ae_level(sensor, 2);
        sensor->set_gain_ctrl(sensor, 1);
        sensor->set_gainceiling(sensor, GAINCEILING_16X);
    }

    Serial0.println("Camera OV5640 inicializada!");

    return true;
}

// ==========================================
// SETUP
// ==========================================

void setup() {
    Serial0.begin(115200);
    delay(2000);

    Serial0.println("SOS-VISION INICIANDO");
    Serial0.println("TESTE Serial00 UART0");

    Serial0.println();
    Serial0.println("================================");
    Serial0.println(" ESP32-S3 + CAMERA OV5640");
    Serial0.println("================================");

    Serial0.printf(
        "PSRAM: %s\n",
        psramFound() ? "OK" : "NAO DETECTADA"
    );

    // Inicializa camera
    if (!startCamera()) {

        Serial0.println("Falha na inicializacao da camera");

        return;
    }

    // Conecta Wi-Fi
    WiFi.mode(WIFI_STA);

    WiFi.setSleep(false);
    WiFi.setAutoReconnect(true);

    WiFi.begin(ssid, password);
    lastWifiAttempt = millis();
    Serial0.println("Conexao Wi-Fi iniciada; reconexao automatica habilitada.");

    if (SOS_API_URL[0] == '\0' || SOS_CAMERA_TOKEN[0] == '\0') {
        Serial0.println("API/token ausentes: preview local continua habilitado.");
    }
}

// ==========================================
// LOOP
// ==========================================

void loop() {

    if (WiFi.status() != WL_CONNECTED) {
        if (millis() - lastWifiAttempt >= 10000) {
            Serial0.println("Wi-Fi desconectado; tentando reconectar.");
            WiFi.disconnect();
            WiFi.begin(ssid, password);
            lastWifiAttempt = millis();
        }
        delay(100);
        return;
    }

    if (!localServersStarted) {
        Serial0.println("Wi-Fi conectado.");
        Serial0.print("IP local: ");
        Serial0.println(WiFi.localIP());
        if (!timeSyncStarted) {
            configTime(0, 0, "time.google.com", "pool.ntp.org");
            timeSyncStarted = true;
            Serial0.println("Sincronizacao NTP iniciada para validar datas TLS.");
        }
        startLocalServers();
    }

    const unsigned long now = millis();
    if (static_cast<int32_t>(now - nextCloudAttemptAt) >= 0) {
        const unsigned long attemptStartedAt = millis();
        if (sendFrameToCloud()) {
            cloudRetryDelayMs = 1000UL;
            nextCloudAttemptAt = attemptStartedAt + FRAME_INTERVAL_MS;
        } else {
            nextCloudAttemptAt = millis() + cloudRetryDelayMs;
            if (cloudRetryDelayMs < 30000UL) {
                cloudRetryDelayMs *= 2;
            } else {
                cloudRetryDelayMs = 60000UL;
            }
        }
    }

    delay(10);
}
