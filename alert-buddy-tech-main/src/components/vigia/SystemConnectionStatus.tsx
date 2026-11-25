import { useEffect, useState } from "react";
import { Camera, Server } from "lucide-react";

import { obterSaudeApi, obterStatusCamera } from "@/lib/sos-api";
import { cn } from "@/lib/utils";

type Connection = "checking" | "online" | "offline";

export function SystemConnectionStatus() {
  const [server, setServer] = useState<Connection>("checking");
  const [camera, setCamera] = useState<Connection>("checking");
  const [lastImage, setLastImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
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
        setLastImage(null);
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
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
          ? `Último quadro: ${new Date(lastImage).toLocaleTimeString("pt-BR")}`
          : "Nenhum quadro recebido recentemente"}
      </span>
    </div>
  );
}
