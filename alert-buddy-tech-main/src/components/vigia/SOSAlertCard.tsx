import { ExternalLink, MapPin, Trash2 } from "lucide-react";
import { AlertaSOS, STATUS_LABEL, TIPO_LABEL } from "@/lib/supabase";
import { formatDateTime } from "@/lib/alerts";
import { cn } from "@/lib/utils";
import { deletarAlerta } from "@/lib/sos-api";
import { toast } from "sonner";

interface SOSAlertCardProps {
  alerta: AlertaSOS;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

const tipoStyles = {
  PERDIDO: "border-warning/50 bg-warning/5",
  ACIDENTE: "border-critical/50 bg-critical/5",
  SEQUESTRO: "border-critical/50 bg-critical/5",
};

const tipoBadgeStyles = {
  PERDIDO: "bg-warning text-warning-foreground",
  ACIDENTE: "bg-critical text-critical-foreground",
  SEQUESTRO: "bg-critical text-critical-foreground",
};

export function SOSAlertCard({ alerta, selected, onSelect, onDelete }: SOSAlertCardProps) {
  const hasLocation = alerta.latitude !== null && alerta.longitude !== null;
  const mapsUrl =
    alerta.mapa ||
    (hasLocation ? `https://www.google.com/maps?q=${alerta.latitude},${alerta.longitude}` : null);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja apagar este alerta?")) return;

    try {
      await deletarAlerta({ data: { id: alerta.id } });
      toast.success("Alerta apagado com sucesso");
      onDelete?.(alerta.id);
    } catch (error) {
      console.error("Erro ao apagar alerta:", error);
      toast.error("Erro ao apagar alerta");
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md",
        selected ? "border-info ring-2 ring-info/20" : "border-border",
        tipoStyles[alerta.tipo],
      )}
      onClick={() => onSelect(alerta.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cn(
                "px-2 py-0.5 rounded text-xs font-medium",
                tipoBadgeStyles[alerta.tipo],
              )}
            >
              {TIPO_LABEL[alerta.tipo]}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(alerta.data_hora)}
            </span>
          </div>

          <p className="text-sm font-medium mb-1 line-clamp-2 whitespace-pre-line">{alerta.mensagem}</p>

          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <MapPin className="size-3" />
            <span>
              {alerta.cidade} - {alerta.regiao}
            </span>
          </div>

          {hasLocation && (
            <div className="text-xs text-muted-foreground mt-1">
              🧭 {alerta.latitude?.toFixed(4)}, {alerta.longitude?.toFixed(4)}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
            {STATUS_LABEL[alerta.status]}
          </span>

          <button
            onClick={handleDelete}
            className="text-xs text-destructive hover:underline flex items-center gap-1"
          >
            <Trash2 className="size-3" />
            Apagar
          </button>

          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-info hover:underline flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3" />
              Ver localização
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
