# Configuração e teste do SOS Vision

## Teste local

1. Configure as variáveis do backend conforme o README principal e inicie a API na porta 8000.
2. No diretório `alert-buddy-tech-main`, copie `.env.example` para `.env` e preencha `VITE_API_URL=http://localhost:8000`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Execute `npm install` e `npm run dev -- --host 0.0.0.0 --port 8080`.
4. Copie `include/secrets.example.h` para `include/secrets.h`. Informe Wi-Fi, URL HTTPS do backend e o mesmo token da variável `CAMERA_TOKEN`.
5. Grave o firmware com PlatformIO. A página e os streams locais continuam disponíveis para verificar a OV5640; a conexão à API é adicional.

Teste a API em `http://localhost:8000/api/health` e `http://localhost:8000/api/camera/status`. A câmera aparece conectada após o primeiro JPEG autenticado. O envio é limitado a cerca de 2 quadros por segundo.

## Publicação

### Supabase

Crie/configure o projeto e execute `supabase/migrations/001_create_alertas_table.sql` e `002_add_snapshot_field.sql`. Alertas, status e snapshots ficam no banco persistente Supabase.

### Render

Crie um Web Service a partir da raiz do projeto usando `render.yaml`. Cadastre, como variáveis privadas, `CAMERA_TOKEN` (segredo aleatório), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ALLOWED_ORIGINS` (URL pública do Netlify). `CALLMEBOT_PHONE` e `CALLMEBOT_APIKEY` são opcionais; `MODO_TESTE=true` evita notificações durante testes. A chave service-role não deve ser compartilhada com o painel nem com o firmware. O health check é `/api/health`.

### Netlify

Publique `alert-buddy-tech-main` no Netlify; `netlify.toml` já define o build (`npm run build`) e a pasta `dist`. Configure no Netlify:

- `VITE_API_URL`: URL pública do Render, sem barra final.
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`: projeto e chave pública do Supabase.
- `LOVABLE_API_KEY`: somente para a análise opcional de câmera do navegador.

Inclua a origem do site Netlify em `ALLOWED_ORIGINS` no Render e redeploy ambos após mudar variáveis.

## Gestos

| Gesto sustentado | Alerta |
|---|---|
| Dois dedos levantados | `PERDIDO` |
| Mão fechada | `ACIDENTE` |
| Mão aberta | `SEQUESTRO` |

O gesto precisa permanecer confirmado por 1,5 segundo. Depois do disparo, há cooldown de 10 segundos. Não há coordenadas GPS no ESP32 atual; a API mantém os campos do alerta e registra localização desconhecida até que um GPS seja integrado.
