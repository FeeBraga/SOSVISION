import {
  AlertTriangle,
  Clock,
  Compass,
  ExternalLink,
  MapPin,
  Radio,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  KIND_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  formatDateTime,
  type AlertStatus,
  type WebAlert,
} from "@/lib/alerts";

const STATUS_ACTIONS: AlertStatus[] = ["verificando", "confirmado", "descartado"];

export function AlertDetail({
  alert,
  onClose,
  onStatusChange,
}: {
  alert: WebAlert;
  onClose: () => void;
  onStatusChange: (id: string, status: AlertStatus) => void;
}) {
  const rows = [
    { icon: Clock, label: "Data e hora da detecção", value: formatDateTime(alert.detectedAt) },
    { icon: MapPin, label: "Localização", value: `${alert.city} / ${alert.state}` },
    {
      icon: Compass,
      label: "Coordenadas",
      value: `${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)}`,
    },
    { icon: Radio, label: "Fonte", value: alert.source },
    {
      icon: ShieldCheck,
      label: "Confiança do detector",
      value: `${Math.round(alert.confidence * 100)}%`,
    },
    { icon: AlertTriangle, label: "Situação", value: STATUS_LABEL[alert.status] },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {KIND_LABEL[alert.kind]} · {SEVERITY_LABEL[alert.severity]}
          </p>
          <h2 className="mt-1 text-lg font-semibold leading-tight">{alert.title}</h2>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto shrink-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{alert.summary}</p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md bg-secondary/60 p-3">
            <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <row.icon className="size-3" />
              {row.label}
            </dt>
            <dd className="mt-1 font-mono text-sm">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {alert.keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground"
          >
            #{keyword}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {STATUS_ACTIONS.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={alert.status === status ? "default" : "outline"}
            onClick={() => onStatusChange(alert.id, status)}
          >
            {STATUS_LABEL[status]}
          </Button>
        ))}
        <Button size="sm" variant="ghost" asChild>
          <a href={alert.sourceUrl} target="_blank" rel="noreferrer">
            Abrir fonte <ExternalLink className="ml-1 size-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
