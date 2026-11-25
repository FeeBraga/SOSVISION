# SOS Vision

Sistema de alertas por gestos com processamento remoto:

- ESP32-S3 + OV5640 envia JPEGs para o backend.
- FastAPI executa MediaPipe/OpenCV e aplica as regras de gestos.
- Supabase PostgreSQL armazena alertas e snapshots; Supabase Realtime atualiza o painel.
- O painel React/TanStack é publicado no Netlify e consulta a API no Render.

Guia passo a passo para publicar e configurar os serviços: [DEPLOY_PARA_ENVIAR.md](../DEPLOY_PARA_ENVIAR.md).

## Gestos e temporizadores

- Dois dedos levantados: `PERDIDO`
- Mão fechada: `ACIDENTE`
- Mão aberta: `SEQUESTRO`
- Confirmação contínua: 1,5 s
- Cooldown entre alertas: 10 s

## Backend local

Use Python 3.12 e instale as dependências na raiz do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:CAMERA_TOKEN = "um-token-local"
$env:SUPABASE_URL = "https://seu-projeto.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "sua-chave-service-role"
$env:ALLOWED_ORIGINS = "http://localhost:8080"
python -m uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

O token é obrigatório para `POST /api/camera/frame`. A API também oferece `GET /api/health`, `GET /api/camera/status` e as operações de alertas em `/api/alertas`.

## Banco de dados

Configure o projeto Supabase e execute as migrations existentes em `supabase/migrations/` para criar `alertas`, `snapshot` e `camera_id`. No Render, configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`; a chave de serviço fica somente no backend. Os dados ficam no Postgres do Supabase, não no disco efêmero do Render.

## Render

Crie um Web Service usando o `render.yaml` na raiz:

- Build: `pip install -r requirements.txt`
- Start: `uvicorn backend.app:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/health`
- Defina `CAMERA_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ALLOWED_ORIGINS` como variáveis privadas do serviço. `ALLOWED_ORIGINS` deve conter a URL pública do Netlify; para desenvolvimento, inclua também a origem local do painel. `CALLMEBOT_PHONE` e `CALLMEBOT_APIKEY` são opcionais para notificações WhatsApp.

O plano Render precisa ter memória suficiente para MediaPipe. O plano gratuito pode suspender o serviço e aumentar a latência do primeiro quadro.

## Netlify

Conecte a pasta `alert-buddy-tech-main` ao Netlify. O `netlify.toml` define `npm run build`, saída `dist` e o preset Nitro para Netlify. Configure:

- `VITE_API_URL`: URL base pública do serviço Render, sem `/` final.
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`: para leitura e Realtime do painel.
- `LOVABLE_API_KEY`: somente se o recurso de análise de câmera do navegador for utilizado.

Nunca use o prefixo `VITE_` em chaves secretas.

## Firmware e preview local

Copie `include/secrets.example.h` para `include/secrets.h` e preencha as credenciais localmente. `include/secrets.h` está no `.gitignore`. Use a URL HTTPS do Render terminada em `/api/camera/frame` e o mesmo `CAMERA_TOKEN` configurado no Render.

Compile e grave com PlatformIO (`pio run -e esp32-s3` e `pio run -e esp32-s3 -t upload`). O firmware envia até dois quadros JPEG por segundo e tenta reconectar ao Wi-Fi automaticamente. O endpoint de nuvem não substitui os servidores HTTP de preview: a página e os streams locais continuam disponíveis na rede local para testar a câmera.

O hardware não fornece GPS. Por isso, alertas da câmera incluem o formato de localização existente, mas usam localização desconhecida/nula em vez de atribuir incorretamente as coordenadas do servidor Render à câmera.
