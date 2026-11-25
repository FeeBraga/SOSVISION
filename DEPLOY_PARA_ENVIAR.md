# SOS Vision — guia para configurar Render, Netlify e ESP32

Este arquivo descreve como publicar a versão que está no projeto. **Não contém credenciais.** Não envie senhas, tokens ou chaves privadas por mensagem, commit ou arquivo compartilhado.

## O que vai em cada serviço

| Serviço | Pasta/arquivo neste projeto | O que hospeda |
|---|---|---|
| Render | raiz do projeto: `render.yaml`, `requirements.txt`, `backend/app.py` | API FastAPI, MediaPipe e OpenCV |
| Netlify | pasta `alert-buddy-tech-main`: `netlify.toml` | painel web React |
| Supabase | `alert-buddy-tech-main/supabase/migrations/` | banco persistente dos alertas |
| ESP32 | `src/main.cpp`, `include/secrets.example.h` | captura da OV5640 e envio de JPEG |

O firmware manda cada JPEG para `POST https://<URL-DO-RENDER>/api/camera/frame`. A câmera autentica com `CAMERA_TOKEN`. O painel consulta `https://<URL-DO-RENDER>/api/alertas` e o status em `/api/health` e `/api/camera/status`; também acompanha o stream contínuo de `/api/camera/stream`, com os pontos da mão, o gesto em leitura e o horário de recebimento.

## 1. Publique primeiro o backend no Render

1. Envie o projeto completo para um repositório GitHub privado ou público. A raiz do repositório precisa conter `render.yaml`, `requirements.txt`, `backend/`, `gesture_detection.py`, `boards/`, `src/` e `platformio.ini`.
2. No Render, escolha **New → Blueprint** e conecte esse repositório. O Blueprint encontrado é o `render.yaml` na raiz.
3. Configure as variáveis solicitadas:

| Variável Render | Valor |
|---|---|
| `CAMERA_TOKEN` | segredo aleatório gerado para a câmera |
| `SUPABASE_URL` | URL do projeto Supabase, formato `https://....supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave privada de serviço do Supabase; somente no Render |
| `ALLOWED_ORIGINS` | URL final do site Netlify; na primeira publicação, use temporariamente a origem local `http://localhost:8080` |
| `CALLMEBOT_PHONE` | opcional; telefone em formato internacional |
| `CALLMEBOT_APIKEY` | opcional; chave do CallMeBot |
| `MODO_TESTE` | `true` para não enviar WhatsApp durante os testes; depois, `false` |

O Render cria o serviço `sos-vision-api` e atribui uma URL, por exemplo `https://sos-vision-api.onrender.com`. **Use a URL realmente mostrada no painel Render; o exemplo não é seu endereço.** O serviço deve responder em `/api/health`.

Para gerar um token aleatório no PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Guarde o token num gerenciador de senhas; ele será usado no Render e no arquivo local da câmera. Não o coloque no frontend.

## 2. Configure o banco persistente Supabase

1. Crie ou escolha um projeto Supabase.
2. No SQL Editor, execute, nesta ordem:
   - `alert-buddy-tech-main/supabase/migrations/001_create_alertas_table.sql`
   - `alert-buddy-tech-main/supabase/migrations/002_add_snapshot_field.sql`
3. Copie a URL do projeto e a **service role key** para as variáveis privadas do Render acima.
4. Copie a URL e a chave **anon/public** para as variáveis do Netlify abaixo.

Não use a service role key no Netlify, no browser ou no ESP32. O Postgres do Supabase mantém os alertas após reinicializações do Render.

## 3. Publique o painel no Netlify

1. Crie um site importando o mesmo repositório GitHub.
2. Defina **Base directory** como `alert-buddy-tech-main`. Build command: `npm run build`. Publish directory: `dist`. O arquivo `alert-buddy-tech-main/netlify.toml` contém o build e o preset Netlify.
3. Cadastre estas variáveis no Netlify:

| Variável Netlify | Valor |
|---|---|
| `VITE_API_URL` | URL base do Render, sem barra final e sem `/api`; ex. `https://sos-vision-api.onrender.com` |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | chave anon/public do Supabase |
| `LOVABLE_API_KEY` | opcional; somente se for usar a análise de câmera do navegador |

4. Faça o deploy. O Netlify vai mostrar o endereço do painel, por exemplo `https://nome-do-site.netlify.app`.
5. Volte às variáveis do Render e atualize `ALLOWED_ORIGINS` com a URL real do Netlify, sem barra final. Faça novo deploy do Render.
6. Faça novo deploy do Netlify depois de configurar `VITE_API_URL`; essa variável é aplicada durante o build.

## 4. Configure o firmware

1. Copie `include/secrets.example.h` para `include/secrets.h` no computador onde compila o firmware. Esse arquivo local é ignorado pelo Git.
2. Preencha `SOS_WIFI_SSID`, `SOS_WIFI_PASSWORD`, `SOS_API_URL` e `SOS_CAMERA_TOKEN`. Use o mesmo token do Render e a URL:

```text
https://<URL-REAL-DO-RENDER>/api/camera/frame
```

3. Compile e grave na placa com o ambiente `esp32-s3` do PlatformIO. A configuração já seleciona o perfil ESP32-S3 N16R8.
4. No painel, abra `/central`. O indicador da câmera fica conectado depois de receber quadros recentes, e o preview ao vivo mostra os pontos da mão, o gesto sendo confirmado e o horário da leitura.

O envio está limitado a aproximadamente dois JPEGs por segundo; o stream atualiza conforme esses quadros chegam, sem gravar vídeo. O backend mantém somente os quadros necessários para o stream em memória. O endpoint do stream é público, como o painel atual; não o use em locais onde a imagem da câmera não possa ser exibida publicamente. O preview HTTP local da câmera foi mantido para testes na rede local; ele não é o endereço público da API.

## Endpoints da API Render

| Método | Caminho | Uso |
|---|---|---|
| `GET` | `/api/health` | saúde do backend |
| `POST` | `/api/camera/frame` | recebe JPEG; exige `Authorization: Bearer <CAMERA_TOKEN>` e `Content-Type: image/jpeg` |
| `GET` | `/api/camera/status` | conectado e horário do último quadro |
| `GET` | `/api/camera/frame/latest` | último JPEG recebido, com horário no cabeçalho `X-Frame-Received-At` |
| `GET` | `/api/camera/stream` | stream MJPEG público com quadro anotado e leitura do gesto |
| `GET` | `/api/alertas` | lista alertas persistidos |
| `POST` | `/api/alertas` | cria alerta |
| `PATCH` | `/api/alertas/{id}` | atualiza status |
| `DELETE` | `/api/alertas/{id}` | apaga alerta |

## Antes de entregar os endereços

Faça estes testes depois de publicar:

1. Abra `https://<URL-REAL-DO-RENDER>/api/health`; deve retornar `{"status":"ok",...}`.
2. Abra `https://<URL-REAL-DO-RENDER>/api/camera/status`; antes de ligar a câmera, `connected` deve ser `false`.
3. Acesse `https://<URL-DO-NETLIFY>/central`; confira se o painel e a conexão do servidor aparecem.
4. Ligue a ESP32; após o primeiro quadro, o status deve mostrar a câmera conectada.
5. Teste os gestos: dois dedos = `PERDIDO`; mão fechada = `ACIDENTE`; mão aberta = `SEQUESTRO`. A confirmação é 1,5 s e o cooldown é 10 s.
6. Confirme que o alerta e o snapshot aparecem no painel e continuam no Supabase após reiniciar o serviço.

**Nota sobre localização:** o hardware atual não tem GPS. Até adicionar GPS à câmera, os alertas terão localização desconhecida; não use a localização do Render como se fosse a da câmera.
