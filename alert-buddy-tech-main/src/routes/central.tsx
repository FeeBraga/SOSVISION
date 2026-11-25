import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bell, BellOff, Search, Shield } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadarMap } from "@/components/vigia/RadarMap";
import { SOSAlertCard } from "@/components/vigia/SOSAlertCard";
import { SOSAlertDetail } from "@/components/vigia/SOSAlertDetail";
import { TestButton } from "@/components/vigia/TestButton";
import { SystemConnectionStatus } from "@/components/vigia/SystemConnectionStatus";
import { supabase, type AlertaSOS } from "@/lib/supabase";
import { listarAlertas } from "@/lib/sos-api";

export const Route = createFileRoute("/central")({
  head: () => ({
    meta: [
      { title: "Sentinela — Central de alertas de emergência" },
      {
        name: "description",
        content:
          "Painel que varre a web e alerta em tempo real sobre pessoas perdidas, acidentes e sequestros, com horário, data e localização.",
      },
      { property: "og:title", content: "Sentinela — Central de alertas de emergência" },
      {
        property: "og:description",
        content:
          "Painel que varre a web e alerta em tempo real sobre pessoas perdidas, acidentes e sequestros, com horário, data e localização.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SOS_FILTERS: Array<{ value: "todos" | "PERDIDO" | "ACIDENTE" | "SEQUESTRO"; label: string }> =
  [
    { value: "todos", label: "Todos" },
    { value: "SEQUESTRO", label: "Sequestro" },
    { value: "ACIDENTE", label: "Acidente" },
    { value: "PERDIDO", label: "Pessoa perdida" },
  ];

function Index() {
  const [sosAlerts, setSosAlerts] = useState<AlertaSOS[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [sosFilter, setSosFilter] = useState<"todos" | "PERDIDO" | "ACIDENTE" | "SEQUESTRO">(
    "todos",
  );
  const [selectedSosId, setSelectedSosId] = useState<string | null>(null);

  const handleDeleteAlert = useCallback(
    (id: string) => {
      setSosAlerts((prev) => prev.filter((alerta) => alerta.id !== id));
      if (selectedSosId === id) {
        setSelectedSosId(null);
      }
    },
    [selectedSosId],
  );
  const [query, setQuery] = useState("");
  const [sound, setSound] = useState(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const beep = useCallback(() => {
    if (!soundRef.current || typeof window === "undefined") return;
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      /* áudio indisponível */
    }
  }, []);

  // Carregar alertas do SOS Vision do Supabase
  useEffect(() => {
    const loadSOSAlerts = async () => {
      try {
        const data = await listarAlertas();
        setSosAlerts(data || []);
      } catch (error) {
        console.error("Erro ao carregar alertas SOS:", error);
      }
    };

    loadSOSAlerts();

    // Configurar Realtime para novos alertas
    const channel = supabase
      .channel("alertas_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alertas",
        },
        (payload) => {
          const newAlert = payload.new as AlertaSOS;
          setSosAlerts((prev) => [newAlert, ...prev]);
          beep();
          toast(`🚨 Novo alerta SOS: ${newAlert.tipo}`, {
            description: `${newAlert.cidade} - ${newAlert.regiao}`,
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "alertas",
        },
        (payload) => {
          const updatedAlert = payload.new as AlertaSOS;
          setSosAlerts((prev) =>
            prev.map((alert) => (alert.id === updatedAlert.id ? updatedAlert : alert)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [beep]);

  const visibleSOS = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sosAlerts.filter((alert) => {
      const matchKind = sosFilter === "todos" || alert.tipo === sosFilter;
      const matchTerm =
        !term ||
        [alert.mensagem, alert.cidade, alert.regiao, alert.pais]
          .join(" ")
          .toLowerCase()
          .includes(term);
      return matchKind && matchTerm;
    });
  }, [sosAlerts, sosFilter, query]);

  const selectedSOS = sosAlerts.find((alert) => alert.id === selectedSosId) ?? null;
  const latestSOS = sosAlerts[0];

  const stats = useMemo(
    () => [
      {
        label: "Alertas SOS ativos",
        value: sosAlerts.filter((a) => a.status !== "resolvido").length,
      },
      {
        label: "Alertas críticos",
        value: sosAlerts.filter((a) => a.tipo === "SEQUESTRO" && a.status !== "resolvido").length,
      },
      {
        label: "Alertas pendentes",
        value: sosAlerts.filter((a) => a.status === "pendente").length,
      },
      {
        label: "Total de alertas",
        value: sosAlerts.length,
      },
    ],
    [sosAlerts],
  );

  const handleSOSStatusChange = (id: string, status: AlertaSOS["status"]) => {
    setSosAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    if (selectedSosId === id) {
      setSelectedSosId(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ animation: "sentinel-rise 0.5s ease-out both" }}>
      <header className="border-b border-border/80 bg-sidebar/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/"
              aria-label="Voltar à tela inicial"
              className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-info/50 hover:text-info"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <span className="relative flex size-9 items-center justify-center rounded-md bg-info/15 text-info">
              <Shield className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold leading-none">SOS Vision</h1>
              <p className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                Sistema de detecção de emergências por gestos
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSound((s) => !s)}>
              {sound ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              <span className="hidden sm:inline">{sound ? "Som ligado" : "Som desligado"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <SystemConnectionStatus />
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-1 font-display text-3xl font-bold">{stat.value}</p>
            </div>
          ))}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section>
            <div className="flex flex-wrap items-center gap-2">
              {SOS_FILTERS.map((item) => (
                <Button
                  key={item.value}
                  size="sm"
                  variant={sosFilter === item.value ? "default" : "outline"}
                  onClick={() => setSosFilter(item.value)}
                >
                  {item.label}
                </Button>
              ))}
              <TestButton />
              <div className="relative ml-auto min-w-52 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar cidade, região ou mensagem"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {visibleSOS.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Nenhum alerta SOS corresponde ao filtro atual.
                </p>
              )}
              {visibleSOS.map((alerta) => (
                <SOSAlertCard
                  key={alerta.id}
                  alerta={alerta}
                  selected={alerta.id === selectedSosId}
                  onSelect={setSelectedSosId}
                  onDelete={handleDeleteAlert}
                />
              ))}
            </div>
          </section>

          <aside className="space-y-5">
            {selectedSOS ? (
              <SOSAlertDetail
                alerta={selectedSOS}
                onClose={() => setSelectedSosId(null)}
                onStatusChange={handleSOSStatusChange}
                onDelete={handleDeleteAlert}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card/50 p-5 text-sm text-muted-foreground">
                Selecione um alerta SOS para ver detalhes e alterar status.
              </div>
            )}

            <RadarMap
              alerts={visibleSOS.map((a) => ({
                id: a.id,
                lat: a.latitude ?? -23.5505,
                lng: a.longitude ?? -46.6333,
                kind: a.tipo.toLowerCase() as "perdido" | "acidente" | "sequestro",
                severity: a.tipo === "SEQUESTRO" ? "critico" : "alto",
                detectedAt: new Date(a.data_hora).toISOString(),
                city: a.cidade,
                state: a.regiao,
                title: a.tipo,
                summary: a.mensagem,
                source: "SOS Vision",
                sourceUrl: "#",
                confidence: 0.95,
                status: a.status === "resolvido" ? "descartado" : "verificando",
                keywords: [],
              }))}
              selectedId={selectedSosId}
              onSelect={setSelectedSosId}
            />

            {latestSOS && (
              <div className="rounded-lg border border-border bg-card p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Shield className="size-4 text-info" /> Informações do sistema
                </h2>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-success" />
                    Detecção de gestos (perdido, acidente, sequestro)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-success" />
                    Localização conforme dados disponíveis
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-success" />
                    Notificações WhatsApp (CallMeBot, opcional)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-success" />
                    Sincronização em tempo real
                  </div>
                </div>
                <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  Última detecção {new Date(latestSOS.data_hora).toLocaleString("pt-BR")} ·{" "}
                  {latestSOS.cidade}/{latestSOS.regiao}
                </p>
              </div>
            )}
          </aside>
        </div>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Sistema de emergência real. Em caso de emergência, acione 190 (polícia), 192 (SAMU) ou 193
          (bombeiros).
        </p>
      </main>
    </div>
  );
}
