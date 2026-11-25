import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, MapPin, Radar, ShieldCheck, Siren, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SENTINELA — Central Inteligente de Monitoramento e Alertas" },
      {
        name: "description",
        content:
          "Central inteligente para monitoramento de ocorrências, identificação de situações de emergência e acompanhamento de alertas em tempo real.",
      },
      {
        property: "og:title",
        content: "SENTINELA — Central Inteligente de Monitoramento e Alertas",
      },
      {
        property: "og:description",
        content:
          "Monitoramento de ocorrências, identificação de emergências e alertas em tempo real em uma única central de operações.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PINS = [
  { top: "26%", left: "62%", color: "bg-critical", delay: "0s" },
  { top: "44%", left: "48%", color: "bg-info", delay: "0.6s" },
  { top: "58%", left: "68%", color: "bg-warning", delay: "1.2s" },
  { top: "72%", left: "56%", color: "bg-info", delay: "1.8s" },
  { top: "36%", left: "34%", color: "bg-critical", delay: "2.4s" },
  { top: "64%", left: "38%", color: "bg-success", delay: "3s" },
];

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Proteção",
    text: "Vigilância contínua de fontes públicas e câmeras conectadas.",
  },
  {
    icon: Zap,
    title: "Prevenção",
    text: "Classificação automática por severidade antes do agravamento.",
  },
  {
    icon: Siren,
    title: "Resposta rápida",
    text: "Data, hora e coordenadas exatas para o acionamento imediato.",
  },
];

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* grade cartográfica */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          animation: "sentinel-drift 24s linear infinite",
        }}
      />
      {/* halo tecnológico */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(700px circle at 78% 18%, oklch(0.7 0.13 220 / 0.18), transparent 60%), radial-gradient(600px circle at 10% 90%, oklch(0.62 0.23 22 / 0.14), transparent 60%)",
        }}
      />
      {/* linha de varredura */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-info/10 to-transparent"
          style={{ animation: "sentinel-scan 9s ease-in-out infinite" }}
        />
      </div>

      {/* pontos de ocorrência sobre o território */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {PINS.map((pin) => (
          <span
            key={`${pin.top}-${pin.left}`}
            className="absolute"
            style={{ top: pin.top, left: pin.left }}
          >
            <span
              className={`absolute inset-0 rounded-full ${pin.color} opacity-50`}
              style={{ animation: "radar-ping 3s ease-out infinite", animationDelay: pin.delay }}
            />
            <span className={`relative block size-1.5 rounded-full ${pin.color}`} />
          </span>
        ))}
      </div>

      <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-5 py-14 text-center sm:px-8">
        <span
          className="grid size-20 place-items-center rounded-2xl border border-info/30 bg-info/10 text-info sm:size-24"
          style={{
            animation:
              "sentinel-rise 0.6s ease-out both, sentinel-glow 4s ease-in-out 0.6s infinite",
          }}
        >
          <Radar className="size-10 sm:size-12" />
        </span>

        <h1
          className="mt-7 font-display text-4xl font-bold tracking-[0.18em] sm:text-6xl"
          style={{ animation: "sentinel-rise 0.6s ease-out 0.1s both" }}
        >
          SENTINELA
        </h1>
        <p
          className="mt-3 text-sm uppercase tracking-[0.25em] text-info sm:text-base"
          style={{ animation: "sentinel-rise 0.6s ease-out 0.2s both" }}
        >
          Central Inteligente de Monitoramento e Alertas
        </p>

        <p
          className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base"
          style={{ animation: "sentinel-rise 0.6s ease-out 0.3s both" }}
        >
          Uma central inteligente para monitoramento de ocorrências, identificação de situações de
          emergência e acompanhamento de alertas em tempo real.
        </p>

        <div
          className="mt-10 w-full"
          style={{ animation: "sentinel-rise 0.6s ease-out 0.4s both" }}
        >
          <Link
            to="/central"
            className="group relative inline-flex w-full max-w-md items-center justify-center gap-3 overflow-hidden rounded-xl border border-info/50 bg-info/15 px-8 py-5 font-display text-base font-bold uppercase tracking-[0.2em] text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-info hover:bg-info/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-lg"
            style={{ animation: "sentinel-glow 3.4s ease-in-out infinite" }}
          >
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/15 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <Siren className="size-5 shrink-0 text-critical" />
            Entrar na central
          </Link>
        </div>

        <section className="mt-14 grid w-full gap-3 sm:grid-cols-3">
          {PILLARS.map((pillar, index) => (
            <div
              key={pillar.title}
              className="rounded-xl border border-border/80 bg-card/60 p-5 text-left backdrop-blur transition-colors hover:border-info/40"
              style={{ animation: `sentinel-rise 0.6s ease-out ${0.5 + index * 0.1}s both` }}
            >
              <pillar.icon className="size-5 text-info" />
              <h2 className="mt-3 text-sm font-semibold">{pillar.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{pillar.text}</p>
            </div>
          ))}
        </section>

        <ul
          className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-widest text-muted-foreground"
          style={{ animation: "sentinel-rise 0.6s ease-out 0.9s both" }}
        >
          <li className="flex items-center gap-1.5">
            <Camera className="size-3.5 text-info" /> Visão por câmera
          </li>
          <li className="flex items-center gap-1.5">
            <MapPin className="size-3.5 text-critical" /> Geolocalização
          </li>
          <li className="flex items-center gap-1.5">
            <Radar className="size-3.5 text-success" /> Varredura contínua
          </li>
        </ul>
      </main>
    </div>
  );
}
