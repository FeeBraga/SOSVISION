# SOS Vision — nuvem

Projeto de detecção de gestos com processamento remoto:

- `backend/`: API FastAPI, OpenCV e MediaPipe publicada no Render.
- `alert-buddy-tech-main/`: painel React publicado no Netlify.
- `src/`: firmware PlatformIO para ESP32-S3 N16R8 + OV5640.
- `include/secrets.example.h`: modelo de configuração local do firmware.

Guia completo de publicação, variáveis de ambiente e configuração do Supabase:
[DEPLOY_PARA_ENVIAR.md](DEPLOY_PARA_ENVIAR.md).

Nunca publique `include/secrets.h`, arquivos `.env` ou chaves privadas.
