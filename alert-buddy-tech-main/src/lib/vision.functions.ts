import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  imageDataUrl: z.string().min(32),
});

export type VisionVerdict = {
  detected: boolean;
  kind: "perdido" | "acidente" | "sequestro" | "nenhum";
  severity: "critico" | "alto" | "medio";
  title: string;
  summary: string;
  confidence: number;
};

const SYSTEM = `Você é um detector de emergências que analisa um frame de câmera ao vivo.
Classifique a cena em uma destas categorias:
- "acidente": colisão, veículo destruído, queda, pessoa ferida, fogo, fumaça.
- "perdido": criança ou idoso sozinho, aparentemente desorientado ou perdido.
- "sequestro": pessoa sendo forçada, imobilizada, amarrada, sob ameaça ou arma visível.
- "nenhum": cena cotidiana sem sinais de emergência.
Seja conservador: só marque detected=true quando houver sinais visuais claros.
Responda SOMENTE com JSON válido no formato:
{"detected":boolean,"kind":"perdido|acidente|sequestro|nenhum","severity":"critico|alto|medio","title":"curto","summary":"1-2 frases em português","confidence":0-1}`;

export const analyzeFrame = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<VisionVerdict> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Analise este frame da câmera." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 429)
        throw new Error("Muitas análises seguidas. Aguarde um instante.");
      if (response.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      throw new Error(`Falha na análise [${response.status}]: ${body}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);

    if (!match) {
      return {
        detected: false,
        kind: "nenhum",
        severity: "medio",
        title: "Sem leitura conclusiva",
        summary: "O modelo não retornou uma avaliação legível para este frame.",
        confidence: 0,
      };
    }

    const parsed = JSON.parse(match[0]) as Partial<VisionVerdict>;
    const kind = (["perdido", "acidente", "sequestro", "nenhum"] as const).includes(
      parsed.kind as never,
    )
      ? (parsed.kind as VisionVerdict["kind"])
      : "nenhum";

    return {
      detected: Boolean(parsed.detected) && kind !== "nenhum",
      kind,
      severity: (["critico", "alto", "medio"] as const).includes(parsed.severity as never)
        ? (parsed.severity as VisionVerdict["severity"])
        : "alto",
      title: typeof parsed.title === "string" && parsed.title ? parsed.title : "Situação analisada",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    };
  });
