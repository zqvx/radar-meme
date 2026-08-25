import type {
  ManualChecks,
  RedFlag,
  ScoreCard,
  ScoreSlice,
} from "./types";
import { ageMs } from "./format";

const AUTO_MAX = 80;
const MANUAL_MAX = 20;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export type ScoreInput = {
  pairCreatedAt: number;
  marketCap: number;
  volumeH24: number;
  liquidityUsd: number;
  priceChangeH1: number;
  priceChangeH24: number;
  buysH24: number;
  sellsH24: number;
  boostsActive: number;
  hasSocials: boolean;
};

function ageSlice(createdAt: number): ScoreSlice {
  const ms = ageMs(createdAt);
  if (!Number.isFinite(ms)) {
    return {
      key: "age",
      label: "Idade",
      points: 0,
      max: 16,
      detail: "Idade do par desconhecida",
    };
  }
  const h = ms / 3_600_000;
  const d = h / 24;
  let points = 0;
  let detail = `${d < 1 ? `${h.toFixed(1)}h` : `${d.toFixed(1)}d`}`;
  if (h < 0.5) {
    points = 0;
    detail = `Muito novo (${Math.round(h * 60)}m) — risco de rug`;
  } else if (h < 6) {
    points = 4;
    detail = `Recém-lançado (${h.toFixed(1)}h)`;
  } else if (h < 24) {
    points = 8;
    detail = `Primeiro dia (${h.toFixed(1)}h)`;
  } else if (d <= 7) {
    points = 16;
    detail = `Janela doce (${d.toFixed(1)}d)`;
  } else if (d <= 30) {
    points = 12;
    detail = `Survivor recente (${d.toFixed(0)}d)`;
  } else if (d <= 90) {
    points = 8;
    detail = `Narrativa madura (${d.toFixed(0)}d)`;
  } else {
    points = 6;
    detail = `Veterano (${d.toFixed(0)}d) — narrativa pode estar fria`;
  }
  return { key: "age", label: "Idade", points, max: 16, detail };
}

function mcapSlice(mcap: number): ScoreSlice {
  // Unknown mcap must NOT score as "small cap".
  if (!(mcap > 0)) {
    return {
      key: "mcap",
      label: "Mcap",
      points: 0,
      max: 16,
      detail: "Market cap desconhecida — sem pontos",
    };
  }
  let points = 0;
  let detail = "";
  if (mcap < 10_000) {
    points = 2;
    detail = "Microcap extrema — fácil de manipular";
  } else if (mcap < 80_000) {
    points = 10;
    detail = "Microcap — upside alto, risco alto";
  } else if (mcap < 500_000) {
    points = 16;
    detail = "Sweet spot de narrativa (80k–500k)";
  } else if (mcap < 2_000_000) {
    points = 12;
    detail = "Já descoberta (500k–2M)";
  } else if (mcap < 10_000_000) {
    points = 8;
    detail = "Mcap média — menos assimétrico";
  } else {
    points = 4;
    detail = "Mcap grande para aposta de 1€";
  }
  return { key: "mcap", label: "Mcap", points, max: 16, detail };
}

function volMcapSlice(volumeH24: number, mcap: number): ScoreSlice {
  if (!(mcap > 0) || !(volumeH24 >= 0)) {
    return {
      key: "volMcap",
      label: "Vol/Mcap",
      points: 0,
      max: 16,
      detail: "Sem mcap — rácio indisponível",
    };
  }
  const r = volumeH24 / mcap;
  let points = 0;
  let detail = `${r.toFixed(2)}× vol/mcap 24h`;
  if (r > 8) {
    points = 2;
    detail = `${r.toFixed(1)}× — possível lavagem`;
  } else if (r > 4) {
    points = 6;
    detail = `${r.toFixed(1)}× — volume quente, verificar wash`;
  } else if (r >= 0.2) {
    points = 16;
    detail = `${r.toFixed(2)}× — fluxo saudável`;
  } else if (r >= 0.08) {
    points = 10;
    detail = `${r.toFixed(2)}× — fluxo moderado`;
  } else {
    points = 2;
    detail = `${r.toFixed(2)}× — livro morto`;
  }
  return { key: "volMcap", label: "Vol/Mcap", points, max: 16, detail };
}

function liqSlice(liq: number, mcap: number): ScoreSlice {
  let points = 0;
  let detail = "";
  if (!(liq > 0)) {
    return {
      key: "liquidity",
      label: "Liquidez",
      points: 0,
      max: 16,
      detail: "Liquidez desconhecida",
    };
  }
  if (liq >= 100_000) {
    points = 16;
    detail = "LP robusta";
  } else if (liq >= 40_000) {
    points = 12;
    detail = "LP decente";
  } else if (liq >= 15_000) {
    points = 8;
    detail = "LP justa — slippage visível";
  } else if (liq >= 5_000) {
    points = 4;
    detail = "LP fina";
  } else {
    points = 0;
    detail = "LP perigosa";
  }
  if (mcap > 0 && liq / mcap < 0.04 && liq < 80_000) {
    detail += " · LP baixa vs mcap";
  }
  return { key: "liquidity", label: "Liquidez", points, max: 16, detail };
}

function momentumSlice(h1: number, h24: number): ScoreSlice {
  const chg = Number.isFinite(h24) ? h24 : h1;
  if (!Number.isFinite(chg)) {
    return {
      key: "momentum",
      label: "Momentum",
      points: 0,
      max: 16,
      detail: "Sem variação de preço",
    };
  }
  let points = 0;
  let detail = `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% / 24h`;
  if (chg > 200) {
    points = 2;
    detail = `Parabólico (+${chg.toFixed(0)}%) — late`;
  } else if (chg > 80) {
    points = 8;
    detail = `Extensão forte (+${chg.toFixed(0)}%)`;
  } else if (chg >= 15) {
    points = 16;
    detail = `Tendência limpa (+${chg.toFixed(1)}%)`;
  } else if (chg >= 5) {
    points = 12;
    detail = `Bid gradual (+${chg.toFixed(1)}%)`;
  } else if (chg >= 0) {
    points = 8;
    detail = `Lateral positivo`;
  } else if (chg >= -15) {
    points = 4;
    detail = `A arrefecer (${chg.toFixed(1)}%)`;
  } else {
    points = 0;
    detail = `Pressão vendedora (${chg.toFixed(1)}%)`;
  }
  if (Number.isFinite(h1) && h1 <= -20) {
    detail += ` · 1h ${h1.toFixed(0)}%`;
  }
  return { key: "momentum", label: "Momentum", points, max: 16, detail };
}

function collectFlags(input: ScoreInput): RedFlag[] {
  const flags: RedFlag[] = [];
  const mcap = input.marketCap;
  const volRatio = mcap > 0 ? input.volumeH24 / mcap : 0;
  const tx = input.buysH24 + input.sellsH24;
  const buyShare = tx > 0 ? input.buysH24 / tx : 0.5;
  const ms = ageMs(input.pairCreatedAt);
  const h = ms / 3_600_000;

  if (volRatio > 5 && tx > 400) {
    flags.push({
      code: "wash",
      label: "Lavagem possível",
      detail: `Vol/mcap ${volRatio.toFixed(1)}× com ${tx} txs/24h`,
      penalty: volRatio > 10 ? 15 : 10,
      severity: "bad",
    });
  } else if (volRatio > 8) {
    flags.push({
      code: "wash",
      label: "Volume anómalo",
      detail: `Vol/mcap ${volRatio.toFixed(1)}×`,
      penalty: 8,
      severity: "warn",
    });
  }

  if (input.priceChangeH1 <= -20 || input.priceChangeH24 <= -35) {
    flags.push({
      code: "dump",
      label: "Dump em curso",
      detail: `1h ${input.priceChangeH1.toFixed(0)}% · 24h ${input.priceChangeH24.toFixed(0)}%`,
      penalty: 15,
      severity: "bad",
    });
  }

  if (input.liquidityUsd > 0 && input.liquidityUsd < 8_000) {
    flags.push({
      code: "thin",
      label: "Liquidez fina",
      detail: "Saída cara e fácil de tap",
      penalty: 10,
      severity: "bad",
    });
  } else if (mcap > 0 && input.liquidityUsd > 0 && input.liquidityUsd / mcap < 0.04) {
    flags.push({
      code: "thin",
      label: "LP baixa vs mcap",
      detail: "Pouco colchão para o tamanho",
      penalty: 8,
      severity: "warn",
    });
  }

  if (Number.isFinite(ms) && h < 0.5) {
    flags.push({
      code: "new",
      label: "Par recém-criado",
      detail: "Janela clássica de rug",
      penalty: 10,
      severity: "bad",
    });
  }

  if (input.boostsActive > 0) {
    flags.push({
      code: "boost",
      label: "Boost DexScreener",
      detail: "Promoção paga — não é procura orgânica",
      penalty: 4,
      severity: "warn",
    });
  }

  if (!input.hasSocials) {
    flags.push({
      code: "social",
      label: "Sem social visível",
      detail: "Sem Twitter/Telegram no perfil DexScreener",
      penalty: 4,
      severity: "warn",
    });
  }

  if (tx > 80 && (buyShare > 0.88 || buyShare < 0.12)) {
    flags.push({
      code: "skew",
      label: "Fluxo enviesado",
      detail: `${Math.round(buyShare * 100)}% buys — bot ou dump one-way`,
      penalty: 6,
      severity: "warn",
    });
  }

  flags.push({
    code: "lock",
    label: "Supply / LP lock desconhecido",
    detail: "A API não confirma LP queimada — confirma no X-Ray",
    penalty: 0,
    severity: "warn",
  });

  return flags;
}

function verdictOf(total: number): Pick<ScoreCard, "verdict" | "verdictLabel"> {
  if (total >= 70) return { verdict: "go", verdictLabel: "Setup decente" };
  if (total >= 40) return { verdict: "caution", verdictLabel: "Cautela" };
  return { verdict: "avoid", verdictLabel: "Evitar" };
}

export function scoreToken(
  input: ScoreInput,
  manual: ManualChecks = { catalysis: false, social: false, lpBurned: false },
): ScoreCard {
  const slices: ScoreSlice[] = [
    ageSlice(input.pairCreatedAt),
    mcapSlice(input.marketCap),
    volMcapSlice(input.volumeH24, input.marketCap),
    liqSlice(input.liquidityUsd, input.marketCap),
    momentumSlice(input.priceChangeH1, input.priceChangeH24),
  ];
  const flags = collectFlags(input);
  const raw = slices.reduce((s, x) => s + x.points, 0);
  const penalty = flags.reduce((s, f) => s + f.penalty, 0);
  const auto = clamp(raw - penalty, 0, AUTO_MAX);
  let manualPts = 0;
  if (manual.catalysis) manualPts += 8;
  if (manual.social) manualPts += 6;
  if (manual.lpBurned) manualPts += 6;
  manualPts = clamp(manualPts, 0, MANUAL_MAX);
  const total = clamp(auto + manualPts, 0, 100);
  const v = verdictOf(total);
  return {
    slices,
    flags,
    auto,
    autoMax: AUTO_MAX,
    manual: manualPts,
    manualMax: MANUAL_MAX,
    total,
    totalMax: 100,
    ...v,
  };
}

export const MANUAL_ITEMS: {
  key: keyof ManualChecks;
  label: string;
  hint: string;
  points: number;
}[] = [
  {
    key: "catalysis",
    label: "Catálise com data",
    hint: "Evento datado (listagem, unlock, collab) — não só 'soon'.",
    points: 8,
  },
  {
    key: "social",
    label: "Social activo",
    hint: "Conta real, replies, não só um banner pago.",
    points: 6,
  },
  {
    key: "lpBurned",
    label: "LP queimada / lock",
    hint: "Confirmaste no explorer ou locker, não no tweet.",
    points: 6,
  },
];
