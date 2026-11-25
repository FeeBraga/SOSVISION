
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include <cstring>
#include <cstdio>

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
static unsigned long lastFrameSent = 0;
static const unsigned long FRAME_INTERVAL_MS = 500;

static const char* RENDER_ROOT_CA PROGMEM = R"PEM(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)PEM";

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

    Serial.println("Requisicao recebida: /");

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

    Serial.println("Cliente conectado ao stream");

    while (true) {

        camera_fb_t *fb = esp_camera_fb_get();

        if (fb == nullptr) {

            Serial.println("Falha na captura da camera");

            return ESP_FAIL;
        }

        if (fb->format != PIXFORMAT_JPEG) {

            esp_camera_fb_return(fb);

            Serial.println("Formato de imagem invalido");

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

    Serial.println("Cliente desconectado do stream");

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

        Serial.printf(
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
        Serial.println("Rota / registrada com sucesso");
    } else {
        Serial.printf("Erro ao registrar rota /: %d\n", result);
    }

    Serial.println("Servidor da pagina iniciado na porta 80");
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
        Serial.printf(
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
        Serial.printf(
            "Stream iniciado na porta %u\n",
            port
        );
    } else {
        Serial.printf(
            "Erro ao registrar stream na porta %u: %d\n",
            port,
            result
        );
    }
}


// ==========================================
// CONFIGURACAO DA CAMERA
// ==========================================

static void startLocalServers() {
    startPageServer();
    startStreamServer(&stream_httpd, 81, 32769);
    startStreamServer(&stream2_httpd, 82, 32770);
    startStreamServer(&stream3_httpd, 83, 32771);
    localServersStarted = true;

    Serial.println("Preview local pronto.");
    Serial.print("Pagina: http://");
    Serial.print(WiFi.localIP());
    Serial.println("/");
    Serial.print("Stream: http://");
    Serial.print(WiFi.localIP());
    Serial.println(":81/stream");
}

static void sendFrameToCloud() {
    if (SOS_API_URL[0] == '\0' || SOS_CAMERA_TOKEN[0] == '\0') {
        return;
    }
    if (strncmp(SOS_API_URL, "https://", 8) != 0) {
        Serial.println("A URL da API deve usar HTTPS.");
        return;
    }

    camera_fb_t* fb = esp_camera_fb_get();
    if (fb == nullptr) {
        Serial.println("Falha ao capturar quadro para envio.");
        return;
    }

    if (fb->format != PIXFORMAT_JPEG) {
        esp_camera_fb_return(fb);
        Serial.println("Quadro ignorado: formato diferente de JPEG.");
        return;
    }

    WiFiClientSecure client;
    client.setCACert(RENDER_ROOT_CA);
    HTTPClient http;
    http.setTimeout(8000);

    if (!http.begin(client, SOS_API_URL)) {
        Serial.println("Falha ao preparar conexao HTTPS com a API.");
        esp_camera_fb_return(fb);
        return;
    }

    http.addHeader("Content-Type", "image/jpeg");
    http.addHeader("Authorization", String("Bearer ") + SOS_CAMERA_TOKEN);
    const int status = http.POST(fb->buf, fb->len);
    if (status < 200 || status >= 300) {
        Serial.printf("Envio do quadro falhou (HTTP %d).\n", status);
    }

    http.end();
    esp_camera_fb_return(fb);
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

        Serial.printf(
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

    Serial.println("Camera OV5640 inicializada!");

    return true;
}

// ==========================================
// SETUP
// ==========================================

void setup() {

    Serial.begin(115200);

    delay(1500);

    Serial.println();
    Serial.println("================================");
    Serial.println(" ESP32-S3 + CAMERA OV5640");
    Serial.println("================================");

    Serial.printf(
        "PSRAM: %s\n",
        psramFound() ? "OK" : "NAO DETECTADA"
    );

    // Inicializa camera
    if (!startCamera()) {

        Serial.println("Falha na inicializacao da camera");

        return;
    }

    // Conecta Wi-Fi
    WiFi.mode(WIFI_STA);

    WiFi.setSleep(false);
    WiFi.setAutoReconnect(true);

    WiFi.begin(ssid, password);
    lastWifiAttempt = millis();
    Serial.println("Conexao Wi-Fi iniciada; reconexao automatica habilitada.");

    if (SOS_API_URL[0] == '\0' || SOS_CAMERA_TOKEN[0] == '\0') {
        Serial.println("API/token ausentes: preview local continua habilitado.");
    }
}

// ==========================================
// LOOP
// ==========================================

void loop() {

    if (WiFi.status() != WL_CONNECTED) {
        if (millis() - lastWifiAttempt >= 10000) {
            Serial.println("Wi-Fi desconectado; tentando reconectar.");
            WiFi.disconnect();
            WiFi.begin(ssid, password);
            lastWifiAttempt = millis();
        }
        delay(100);
        return;
    }

    if (!localServersStarted) {
        Serial.println("Wi-Fi conectado.");
        Serial.print("IP local: ");
        Serial.println(WiFi.localIP());
        startLocalServers();
    }

    if (millis() - lastFrameSent >= FRAME_INTERVAL_MS) {
        lastFrameSent = millis();
        sendFrameToCloud();
    }

    delay(10);
}
