export type AlertKind = "perdido" | "acidente" | "sequestro";
export type AlertSeverity = "critico" | "alto" | "medio";
export type AlertStatus = "novo" | "verificando" | "confirmado" | "descartado";

export type WebAlert = {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  detectedAt: string;
  confidence: number;
  keywords: string[];
};

export const KIND_LABEL: Record<AlertKind, string> = {
  perdido: "Pessoa perdida",
  acidente: "Acidente",
  sequestro: "Sequestro",
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Médio",
};

export const STATUS_LABEL: Record<AlertStatus, string> = {
  novo: "Novo",
  verificando: "Verificando",
  confirmado: "Confirmado",
  descartado: "Descartado",
};

export const MONITORED_KEYWORDS = [
  "desaparecido",
  "não voltou para casa",
  "colisão frontal",
  "capotamento",
  "sequestro relâmpago",
  "refém",
  "resgate em andamento",
  "criança perdida",
  "atropelamento",
  "cárcere privado",
];

export const SOURCES = [
  "Rede social X",
  "Portal de notícias G1",
  "Boletim PM (feed público)",
  "Grupo público WhatsApp",
  "Escuta rádio 190",
  "Fórum comunitário",
  "Instagram - páginas locais",
];

type Seed = Omit<WebAlert, "id" | "detectedAt"> & { minutesAgo: number };

const CITIES: Array<{ city: string; state: string; lat: number; lng: number }> = [
  { city: "São Paulo", state: "SP", lat: -23.5505, lng: -46.6333 },
  { city: "Rio de Janeiro", state: "RJ", lat: -22.9068, lng: -43.1729 },
  { city: "Belo Horizonte", state: "MG", lat: -19.9167, lng: -43.9345 },
  { city: "Curitiba", state: "PR", lat: -25.4284, lng: -49.2733 },
  { city: "Recife", state: "PE", lat: -8.0476, lng: -34.877 },
  { city: "Porto Alegre", state: "RS", lat: -30.0346, lng: -51.2177 },
  { city: "Salvador", state: "BA", lat: -12.9777, lng: -38.5016 },
  { city: "Manaus", state: "AM", lat: -3.119, lng: -60.0217 },
];

const SEEDS: Seed[] = [
  {
    kind: "sequestro",
    severity: "critico",
    status: "confirmado",
    title: "Relato de sequestro relâmpago em posto de combustível",
    summary:
      "Múltiplas postagens descrevem veículo prata levando motorista sob ameaça. Placa parcial informada por duas testemunhas distintas.",
    source: "Rede social X",
    sourceUrl: "https://x.com/search?q=sequestro",
    ...CITIES[0]!,
    confidence: 0.93,
    keywords: ["sequestro relâmpago", "refém"],
    minutesAgo: 4,
  },
  {
    kind: "acidente",
    severity: "alto",
    status: "verificando",
    title: "Colisão frontal com vítimas presas nas ferragens",
    summary:
      "Escuta de rádio menciona duas viaturas e resgate em andamento no km 214. Trânsito interrompido nos dois sentidos.",
    source: "Escuta rádio 190",
    sourceUrl: "https://example.org/boletim",
    ...CITIES[3]!,
    confidence: 0.81,
    keywords: ["colisão frontal", "resgate em andamento"],
    minutesAgo: 11,
  },
  {
    kind: "perdido",
    severity: "critico",
    status: "novo",
    title: "Criança de 6 anos desaparecida desde a manhã",
    summary:
      "Publicações repetidas em páginas locais com foto e descrição de roupas. Último avistamento próximo à praça central.",
    source: "Instagram - páginas locais",
    sourceUrl: "https://example.org/post",
    ...CITIES[4]!,
    confidence: 0.88,
    keywords: ["criança perdida", "desaparecido"],
    minutesAgo: 23,
  },
  {
    kind: "perdido",
    severity: "medio",
    status: "verificando",
    title: "Idoso não retornou para casa após consulta",
    summary:
      "Familiares publicaram pedido de ajuda em grupo do bairro. Sinal de celular perdido há 5 horas.",
    source: "Grupo público WhatsApp",
    sourceUrl: "https://example.org/grupo",
    ...CITIES[2]!,
    confidence: 0.64,
    keywords: ["não voltou para casa", "desaparecido"],
    minutesAgo: 48,
  },
  {
    kind: "acidente",
    severity: "medio",
    status: "confirmado",
    title: "Atropelamento em avenida movimentada",
    summary:
      "Portal local confirma vítima consciente encaminhada ao hospital. Faixa da direita bloqueada.",
    source: "Portal de notícias G1",
    sourceUrl: "https://example.org/noticia",
    ...CITIES[1]!,
    confidence: 0.76,
    keywords: ["atropelamento"],
    minutesAgo: 72,
  },
  {
    kind: "sequestro",
    severity: "alto",
    status: "descartado",
    title: "Suposto cárcere privado em imóvel abandonado",
    summary:
      "Boato originado de um único perfil sem corroboração. Boletim oficial não registra ocorrência no endereço.",
    source: "Fórum comunitário",
    sourceUrl: "https://example.org/forum",
    ...CITIES[5]!,
    confidence: 0.31,
    keywords: ["cárcere privado"],
    minutesAgo: 130,
  },
  {
    kind: "acidente",
    severity: "alto",
    status: "confirmado",
    title: "Capotamento de van com passageiros",
    summary: "Boletim público relata sete ocupantes, três com ferimentos leves. Equipes no local.",
    source: "Boletim PM (feed público)",
    sourceUrl: "https://example.org/boletim2",
    ...CITIES[6]!,
    confidence: 0.85,
    keywords: ["capotamento"],
    minutesAgo: 190,
  },
];

let counter = 0;
const nextId = () => `alt-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function buildInitialAlerts(now: number): WebAlert[] {
  return SEEDS.map((seed, index) => {
    const { minutesAgo, ...rest } = seed;
    return {
      ...rest,
      id: `seed-${index}`,
      detectedAt: new Date(now - minutesAgo * 60_000).toISOString(),
    };
  });
}

const TEMPLATES: Array<Pick<Seed, "kind" | "title" | "summary" | "keywords">> = [
  {
    kind: "perdido",
    title: "Adolescente desaparecida após sair da escola",
    summary: "Vários relatos convergentes citando o mesmo nome e horário de saída.",
    keywords: ["desaparecido"],
  },
  {
    kind: "acidente",
    title: "Motocicleta colide com caminhão em rodovia",
    summary: "Relatos de congestionamento e ambulância a caminho do local.",
    keywords: ["colisão frontal"],
  },
  {
    kind: "sequestro",
    title: "Tentativa de sequestro relatada em ponto de ônibus",
    summary: "Testemunha descreve abordagem forçada com veículo escuro sem placa.",
    keywords: ["sequestro relâmpago", "refém"],
  },
  {
    kind: "perdido",
    title: "Homem com Alzheimer visto caminhando sozinho",
    summary: "Postagem com foto compartilhada mais de 400 vezes em uma hora.",
    keywords: ["não voltou para casa"],
  },
  {
    kind: "acidente",
    title: "Queda de árvore atinge veículo em movimento",
    summary: "Imagens amadoras mostram via parcialmente interditada.",
    keywords: ["resgate em andamento"],
  },
];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

export function generateAlert(): WebAlert {
  const template = pick(TEMPLATES);
  const place = pick(CITIES);
  const confidence = Math.round((0.45 + Math.random() * 0.53) * 100) / 100;
  const severity: AlertSeverity =
    template.kind === "sequestro" || confidence > 0.85
      ? "critico"
      : confidence > 0.65
        ? "alto"
        : "medio";

  return {
    id: nextId(),
    kind: template.kind,
    severity,
    status: "novo",
    title: template.title,
    summary: template.summary,
    source: pick(SOURCES),
    sourceUrl: "https://example.org/fonte",
    city: place.city,
    state: place.state,
    lat: place.lat + (Math.random() - 0.5) * 0.12,
    lng: place.lng + (Math.random() - 0.5) * 0.12,
    detectedAt: new Date().toISOString(),
    confidence,
    keywords: template.keywords,
  };
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  // Não força timezone - usa o timezone que vem no ISO (Brasília)
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function timeAgo(iso: string, now: number) {
  const diff = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `há ${diff}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}
