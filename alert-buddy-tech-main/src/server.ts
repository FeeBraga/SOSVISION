import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { createClient } from "@supabase/supabase-js";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    // Handler para /api/alertas
    if (url.pathname === "/api/alertas") {
      if (request.method === "POST") {
        try {
          console.log("📥 Recebendo POST /api/alertas");
          const body = await request.json();
          console.log("📦 Payload recebido:", JSON.stringify(body, null, 2));

          // Validar campos obrigatórios
          const requiredFields = ["tipo", "mensagem", "data_hora", "cidade", "regiao", "pais"];
          for (const field of requiredFields) {
            if (!body[field]) {
              throw new Error(`Campo obrigatório ausente: ${field}`);
            }
          }

          // Validar tipo
          const validTypes = ["PERDIDO", "ACIDENTE", "SEQUESTRO"];
          if (!validTypes.includes(body.tipo)) {
            throw new Error(`Tipo inválido: ${body.tipo}. Deve ser: ${validTypes.join(", ")}`);
          }

          // Conectar ao Supabase com service role key
          const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
          const supabaseKey =
            import.meta.env["SUPABASE_SERVICE_ROLE_KEY"] ||
            import.meta.env["VITE_SUPABASE_ANON_KEY"];

          if (!supabaseUrl || !supabaseKey) {
            throw new Error("Credenciais do Supabase não configuradas no servidor");
          }

          const supabase = createClient(supabaseUrl, supabaseKey);

          // Inserir no Supabase
          const { data, error } = await supabase
            .from("alertas")
            .insert({
              tipo: body.tipo,
              mensagem: body.mensagem,
              data_hora: body.data_hora,
              cidade: body.cidade,
              regiao: body.regiao,
              pais: body.pais,
              latitude: body.latitude || null,
              longitude: body.longitude || null,
              mapa: body.mapa || null,
              status: "pendente",
              ip: body.ip || null,
              snapshot: body.snapshot || null,
              camera_id: body.camera_id || null,
            })
            .select()
            .single();

          if (error) {
            console.error("❌ Erro ao inserir no Supabase:", error);
            throw new Error(`Erro ao inserir no Supabase: ${error.message}`);
          }

          console.log("✅ Alerta inserido com sucesso:", data);

          return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (error) {
          console.error("❌ Erro ao processar alerta:", error);
          console.error("Stack:", error instanceof Error ? error.stack : "No stack");

          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          const errorStack = error instanceof Error ? error.stack : "No stack";

          return new Response(
            JSON.stringify({
              error: "Failed to process alert",
              message: errorMessage,
              stack: errorStack,
            }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            },
          );
        }
      }

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
