import { Camera, ExternalLink, MapPin, X, Maximize2, Trash2 } from "lucide-react";
import { AlertaSOS, STATUS_LABEL, TIPO_LABEL } from "@/lib/supabase";
import { formatDateTime } from "@/lib/alerts";
import { Button } from "@/components/ui/button";
import { atualizarStatusAlerta, deletarAlerta } from "@/lib/sos-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface SOSAlertDetailProps {
  alerta: AlertaSOS;
  onClose: () => void;
  onStatusChange?: (id: string, status: AlertaSOS["status"]) => void;
  onDelete?: (id: string) => void;
}

const tipoBadgeStyles = {
  PERDIDO: "bg-warning text-warning-foreground",
  ACIDENTE: "bg-critical text-critical-foreground",
  SEQUESTRO: "bg-critical text-critical-foreground",
};

export function SOSAlertDetail({ alerta, onClose, onStatusChange, onDelete }: SOSAlertDetailProps) {
  const [snapshotExpanded, setSnapshotExpanded] = useState(false);

  const handleStatusChange = async (newStatus: AlertaSOS["status"]) => {
    try {
      await atualizarStatusAlerta({ data: { id: alerta.id, status: newStatus } });
      toast.success("Status atualizado com sucesso");
      onStatusChange?.(alerta.id, newStatus);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast.error("Erro ao atualizar status");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja apagar este alerta?")) return;

    try {
      await deletarAlerta({ data: { id: alerta.id } });
      toast.success("Alerta apagado com sucesso");
      onDelete?.(alerta.id);
      onClose();
    } catch (error) {
      console.error("Erro ao apagar alerta:", error);
      toast.error("Erro ao apagar alerta");
    }
  };

  const hasLocation = alerta.latitude !== null && alerta.longitude !== null;
  const mapsUrl =
    alerta.mapa ||
    (hasLocation ? `https://www.google.com/maps?q=${alerta.latitude},${alerta.longitude}` : null);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <span
            className={cn("px-2 py-0.5 rounded text-xs font-medium", tipoBadgeStyles[alerta.tipo])}
          >
            {TIPO_LABEL[alerta.tipo]}
          </span>
          <h3 className="text-lg font-semibold mt-2 whitespace-pre-line">{alerta.mensagem}</h3>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Data e hora</p>
          <p className="font-medium">{formatDateTime(alerta.data_hora)}</p>
        </div>

        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Localização</p>
          <div className="flex items-center gap-2 mt-1">
            <MapPin className="size-4 text-info" />
            <span className="font-medium">{alerta.cidade}</span>
            <span className="text-muted-foreground">-</span>
            <span>{alerta.regiao}</span>
            <span className="text-muted-foreground">-</span>
            <span>{alerta.pais}</span>
          </div>
        </div>

        {alerta.camera_id && (
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Câmera</p>
            <div className="flex items-center gap-2 mt-1">
              <Camera className="size-4 text-muted-foreground" />
              <span className="font-medium">{alerta.camera_id}</span>
            </div>
          </div>
        )}

        {alerta.snapshot && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Snapshot do momento
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSnapshotExpanded(!snapshotExpanded)}
                className="h-6 px-2 text-xs"
              >
                <Maximize2 className="size-3 mr-1" />
                {snapshotExpanded ? "Minimizar" : "Ampliar"}
              </Button>
            </div>
            <div
              className={cn(
                "rounded-lg border border-border overflow-hidden bg-black cursor-pointer transition-all",
                snapshotExpanded
                  ? "fixed inset-4 z-50 rounded-lg flex items-center justify-center"
                  : "max-h-32",
              )}
              onClick={() => setSnapshotExpanded(!snapshotExpanded)}
            >
              <img
                src={`data:image/jpeg;base64,${alerta.snapshot}`}
                alt="Snapshot do alerta"
                className={cn(
                  "object-contain",
                  snapshotExpanded ? "max-h-full max-w-full" : "w-full h-auto",
                )}
              />
            </div>
          </div>
        )}

        {hasLocation && (
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Coordenadas</p>
            <p className="font-mono text-xs mt-1">
              🧭 {alerta.latitude?.toFixed(4)}, {alerta.longitude?.toFixed(4)}
            </p>
          </div>
        )}

        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Status atual</p>
          <span className="inline-block mt-1 px-2 py-1 rounded-full bg-secondary text-secondary-foreground text-xs">
            {STATUS_LABEL[alerta.status]}
          </span>
        </div>

        {mapsUrl && (
          <div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-info hover:underline"
            >
              <ExternalLink className="size-4" />
              Abrir no Google Maps
            </a>
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3">Alterar status:</p>
        <div className="flex flex-wrap gap-2">
          {(["pendente", "em atendimento", "resolvido"] as const).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={alerta.status === status ? "default" : "outline"}
              onClick={() => handleStatusChange(status)}
            >
              {STATUS_LABEL[status]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
