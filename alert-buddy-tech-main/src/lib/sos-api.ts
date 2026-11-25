import type { AlertaSOS } from "@/lib/supabase";

type AlertInput = Pick<
  AlertaSOS,
  | "tipo"
  | "mensagem"
  | "data_hora"
  | "cidade"
  | "regiao"
  | "pais"
  | "latitude"
  | "longitude"
  | "mapa"
> &
  Partial<Pick<AlertaSOS, "ip" | "snapshot" | "camera_id">>;

function apiUrl(path: string) {
  const baseUrl = import.meta.env["VITE_API_URL"]?.replace(/\/+$/, "");
  if (!baseUrl) throw new Error("VITE_API_URL não está configurada.");
  return `${baseUrl}${path}`;
}

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  let payload: unknown;
  let responseWasNonJson = false;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      responseWasNonJson = true;
      payload = text.trim().slice(0, 240);
    }
  }
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String(payload.detail)
        : typeof payload === "string" && payload
          ? `Falha na API (${response.status}): ${payload}`
          : `Falha na API (${response.status})`;
    throw new Error(detail);
  }
  if (responseWasNonJson) {
    throw new Error("A API retornou uma resposta que não é JSON.");
  }
  return payload as T;
}

export function receberAlertaSOS({ data }: { data: AlertInput }) {
  return requestApi<AlertaSOS>("/api/alertas", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listarAlertas() {
  return requestApi<AlertaSOS[]>("/api/alertas");
}

export function atualizarStatusAlerta({
  data,
}: {
  data: { id: string; status: AlertaSOS["status"] };
}) {
  return requestApi<AlertaSOS>(`/api/alertas/${encodeURIComponent(data.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: data.status }),
  });
}

export function deletarAlerta({ data }: { data: { id: string } }) {
  return requestApi<void>(`/api/alertas/${encodeURIComponent(data.id)}`, {
    method: "DELETE",
  });
}

export function obterSaudeApi() {
  return requestApi<{ status: string }>("/api/health");
}

export function obterStatusCamera() {
  return requestApi<{ connected: boolean; last_image_received_at: string | null }>(
    "/api/camera/status",
  );
}

export function obterUrlStreamCamera() {
  return apiUrl("/api/camera/stream");
}
