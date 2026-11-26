import { useEffect, useRef, useState } from "react";
import { Camera, Server } from "lucide-react";

import { obterSaudeApi, obterStatusCamera, obterUrlStreamCamera } from "@/lib/sos-api";
import { cn } from "@/lib/utils";

type Connection = "checking" | "online" | "offline";

export function SystemConnectionStatus() {
  const [server, setServer] = useState<Connection>("checking");
  const [camera, setCamera] = useState<Connection>("checking");
  const [lastImage, setLastImage] = useState<string | null>(null);
  const [liveGesture, setLiveGesture] = useState<string | null>(null);
  const [gestureFrameAt, setGestureFrameAt] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const cameraRefreshingRef = useRef(false);
  const healthRefreshingRef = useRef(false);

  useEffect(() => {
    let active = true;
    try {
      setStreamUrl(obterUrlStreamCamera());
    } catch (error) {
      setStreamError(
        error instanceof Error ? error.message : "Não foi possível acessar a transmissão.",
      );
    }

    const refreshCamera = async () => {
      if (cameraRefreshingRef.current) return;
      cameraRefreshingRef.current = true;
      try {
        const cameraResult = await obterStatusCamera();
        if (!active) return;
        setCamera(cameraResult.connected ? "online" : "offline");
        setLastImage(cameraResult.last_image_received_at);
        setLiveGesture(cameraResult.live_gesture);
        setGestureFrameAt(cameraResult.last_gesture_frame_at);
      } catch {
        if (active) setCamera("offline");
      } finally {
        cameraRefreshingRef.current = false;
      }
    };

    const refreshHealth = async () => {
      if (healthRefreshingRef.current) return;
      healthRefreshingRef.current = true;
      try {
        await obterSaudeApi();
        if (active) setServer("online");
      } catch {
        if (active) setServer("offline");
      } finally {
        healthRefreshingRef.current = false;
      }
    };

    void refreshHealth();
    void refreshCamera();
    const cameraInterval = window.setInterval(() => void refreshCamera(), 250);
    const healthInterval = window.setInterval(() => void refreshHealth(), 15000);
    return () => {
      active = false;
      window.clearInterval(cameraInterval);
      window.clearInterval(healthInterval);
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
  const gestureAgeMs = gestureFrameAt
    ? Math.max(0, Date.now() - Date.parse(gestureFrameAt))
    : null;
  const gestureReadingFresh = gestureAgeMs !== null && gestureAgeMs <= 500;

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
      <span
        className={cn(
          "font-medium",
          gestureReadingFresh ? "text-success" : "text-warning",
        )}
        title="Resultado do último quadro analisado; não significa que o alerta já foi confirmado."
        aria-live="polite"
      >
        {gestureAgeMs === null
          ? "Leitura: aguardando análise"
          : gestureReadingFresh
            ? `Leitura: ${liveGesture ?? "nenhum gesto"}`
            : `Leitura atrasada: ${liveGesture ?? "nenhum gesto"} (${(gestureAgeMs / 1000).toFixed(1)} s)`}
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
          Imagem: até 10 quadros/s teóricos. A leitura acima mostra o último quadro analisado e fica
          amarela após 0,5 s sem novo quadro analisado; alertas aguardam estabilidade e 1,5 s. A taxa real
          depende da captura, Wi-Fi, TLS, rede e CPU do Render Free; não há garantia de latência rígida.
        </p>
      </div>
    </div>
  );
}
