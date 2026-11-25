import { useEffect, useRef, useState } from "react";
import { Camera, Server } from "lucide-react";

import { obterSaudeApi, obterStatusCamera, obterUrlStreamCamera } from "@/lib/sos-api";
import { cn } from "@/lib/utils";

type Connection = "checking" | "online" | "offline";

export function SystemConnectionStatus() {
  const [server, setServer] = useState<Connection>("checking");
  const [camera, setCamera] = useState<Connection>("checking");
  const [lastImage, setLastImage] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    let active = true;
    try {
      setStreamUrl(obterUrlStreamCamera());
    } catch (error) {
      setStreamError(
        error instanceof Error ? error.message : "Não foi possível acessar a transmissão.",
      );
    }

    const refresh = async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const [healthResult, cameraResult] = await Promise.allSettled([
          obterSaudeApi(),
          obterStatusCamera(),
        ]);
        if (!active) return;

        setServer(healthResult.status === "fulfilled" ? "online" : "offline");
        if (cameraResult.status === "fulfilled") {
          setCamera(cameraResult.value.connected ? "online" : "offline");
          setLastImage(cameraResult.value.last_image_received_at);
        } else {
          setCamera("offline");
        }
      } finally {
        refreshingRef.current = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const indicatorClass = (state: Connection) =>
    cn(
      "size-2 rounded-full",
      state === "online" && "bg-success",
      state === "offline" && "bg-destructive",
      state === "checking" && "bg-warning",
    );
  const label = (state: Connection) =>
    state === "online" ? "Conectado" : state === "offline" ? "Desconectado" : "Verificando";
  const streamActive = camera === "online" && streamReady;

  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-xs"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Server className="size-4 text-muted-foreground" />
        <span className={indicatorClass(server)} />
        <span>Servidor: {label(server)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Camera className="size-4 text-muted-foreground" />
        <span className={indicatorClass(camera)} />
        <span>Câmera: {label(camera)}</span>
      </div>
      <span className="text-muted-foreground">
        {lastImage
          ? `Lido pelo servidor: ${new Date(lastImage).toLocaleString("pt-BR")}`
          : "Nenhum quadro recebido recentemente"}
      </span>
      <div className="w-full max-w-xl overflow-hidden rounded-md border border-border bg-sidebar">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 font-medium">
          <span>Câmera e leitura ao vivo</span>
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
            <span
              className={indicatorClass(
                streamActive ? "online" : camera === "offline" ? "offline" : "checking",
              )}
            />
            {streamActive ? "Ao vivo" : camera === "online" ? "Conectando" : "Aguardando câmera"}
          </span>
        </div>
        <div className="relative flex aspect-video items-center justify-center">
          {streamUrl && (
            <img
              src={streamUrl}
              alt="Transmissão ao vivo da câmera com leitura de gestos no servidor"
              className="size-full object-contain"
              onLoad={() => {
                setStreamReady(true);
                setStreamError(null);
              }}
              onError={() => {
                setStreamReady(false);
                setStreamError("Transmissão indisponível. Verifique a câmera e o backend.");
              }}
            />
          )}
          {!streamReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-sidebar/90 px-4 text-center text-muted-foreground">
              <p>{streamError ?? "Aguardando a primeira imagem da câmera…"}</p>
            </div>
          )}
        </div>
        <p className="border-t border-border px-3 py-2 text-muted-foreground">
          O vídeo mostra os pontos da mão, o gesto em confirmação e a hora de leitura. Atualiza
          conforme a ESP32 envia quadros (até 2 por segundo).
        </p>
      </div>
    </div>
  );
}
