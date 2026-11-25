-- Habilitar extensão UUID se não estiver habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Criar tabela alertas
CREATE TABLE IF NOT EXISTS alertas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('PERDIDO', 'ACIDENTE', 'SEQUESTRO')),
  mensagem TEXT NOT NULL,
  data_hora TIMESTAMP WITH TIME ZONE NOT NULL,
  cidade TEXT NOT NULL,
  regiao TEXT NOT NULL,
  pais TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  mapa TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em atendimento', 'resolvido')),
  ip TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_alertas_created_at ON alertas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_status ON alertas(status);
CREATE INDEX IF NOT EXISTS idx_alertas_tipo ON alertas(tipo);

-- Habilitar Row Level Security (RLS)
ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
-- Permitir leitura pública (ajustar conforme necessário)
CREATE POLICY "Permitir leitura pública de alertas"
  ON alertas FOR SELECT
  TO public
  USING (true);

-- Permitir inserção via service role (no backend)
CREATE POLICY "Permitir inserção de alertas"
  ON alertas FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Permitir atualização via service role (no backend)
CREATE POLICY "Permitir atualização de alertas"
  ON alertas FOR UPDATE
  TO service_role
  USING (true);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_alertas_updated_at
  BEFORE UPDATE ON alertas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Habilitar Realtime para a tabela alertas
ALTER PUBLICATION supabase_realtime ADD TABLE alertas;
