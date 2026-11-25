-- Adicionar campo snapshot (base64 da imagem do momento do alerta)
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS snapshot TEXT;

-- Adicionar campo camera_id para identificar a câmera
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS camera_id TEXT DEFAULT 'camera_local_01';
