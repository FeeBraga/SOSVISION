import { cn } from "@/lib/utils";
import type { WebAlert } from "@/lib/alerts";

const BOUNDS = { minLat: -34, maxLat: 2, minLng: -74, maxLng: -33 };

const dotColor: Record<WebAlert["kind"], string> = {
  sequestro: "bg-critical",
  acidente: "bg-warning",
  perdido: "bg-info",
};

export function RadarMap({
  alerts,
  selectedId,
  onSelect,
}: {
  alerts: WebAlert[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-border bg-sidebar">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <div className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Mapa tático · Brasil
      </div>

      {alerts.map((alert) => {
        const x = ((alert.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
        const y = ((BOUNDS.maxLat - alert.lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
        const active = alert.id === selectedId;
        return (
          <button
            key={alert.id}
            type="button"
            onClick={() => onSelect(alert.id)}
            title={`${alert.title} — ${alert.city}/${alert.state}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span
              className={cn("absolute inset-0 rounded-full opacity-60", dotColor[alert.kind])}
              style={{ animation: "radar-ping 2.4s ease-out infinite" }}
            />
            <span
              className={cn(
                "relative block size-2.5 rounded-full ring-2 ring-background",
                dotColor[alert.kind],
                active && "size-4 ring-ring",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
