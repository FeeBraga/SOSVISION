import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabaseAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials not found. Some features may not work.");
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

export type AlertaSOS = {
  id: string;
  tipo: "PERDIDO" | "ACIDENTE" | "SEQUESTRO";
  mensagem: string;
  data_hora: string;
  cidade: string;
  regiao: string;
  pais: string;
  latitude: number | null;
  longitude: number | null;
  mapa: string | null;
  status: "pendente" | "em atendimento" | "resolvido";
  ip: string | null;
  snapshot: string | null;
  camera_id: string | null;
  created_at: string;
};

export const STATUS_LABEL: Record<AlertaSOS["status"], string> = {
  pendente: "Pendente",
  "em atendimento": "Em atendimento",
  resolvido: "Resolvido",
};

export const TIPO_LABEL: Record<AlertaSOS["tipo"], string> = {
  PERDIDO: "Pessoa perdida",
  ACIDENTE: "Acidente",
  SEQUESTRO: "Sequestro",
};
