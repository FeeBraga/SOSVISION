import { Clock, MapPin, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { KIND_LABEL, SEVERITY_LABEL, STATUS_LABEL, timeAgo, type WebAlert } from "@/lib/alerts";

const severityStyle: Record<WebAlert["severity"], string> = {
  critico: "bg-critical/15 text-critical border-critical/40",
  alto: "bg-warning/15 text-warning border-warning/40",
  medio: "bg-info/15 text-info border-info/40",
};

const kindStyle: Record<WebAlert["kind"], string> = {
  sequestro: "border-l-critical",
  acidente: "border-l-warning",
  perdido: "border-l-info",
};

export function AlertCard({
  alert,
  now,
  selected,
  onSelect,
}: {
  alert: WebAlert;
  now: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(alert.id)}
      style={{ animation: "ticker-in 320ms ease-out" }}
      className={cn(
        "w-full rounded-lg border border-border border-l-4 bg-card p-4 text-left transition-colors hover:bg-accent/40",
        kindStyle[alert.kind],
        selected && "bg-accent/60 ring-1 ring-ring/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            severityStyle[alert.severity],
          )}
        >
          {SEVERITY_LABEL[alert.severity]}
        </span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
          {KIND_LABEL[alert.kind]}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" />
          {timeAgo(alert.detectedAt, now)}
        </span>
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug">{alert.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{alert.summary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="size-3" />
          {alert.city}/{alert.state}
        </span>
        <span className="flex items-center gap-1">
          <Radio className="size-3" />
          {alert.source}
        </span>
        <span className="ml-auto font-mono text-foreground/80">
          {Math.round(alert.confidence * 100)}% · {STATUS_LABEL[alert.status]}
        </span>
      </div>
    </button>
  );
}
