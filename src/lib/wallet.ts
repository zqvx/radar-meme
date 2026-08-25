// Carteira de paper trading — toda a lógica é pura (sem React) para dar
// para testar e auditar. Dinheiro 100% fictício: treina o processo, não
// move um cêntimo real.
import { tokenKey } from "./format";

export type EquityPoint = { t: number; equity: number };

export type WalletTx = {
  id: string;
  t: string; // ISO
  kind: "deposit" | "buy" | "sell";
  eur: number; // depósito: +; compra: custo (negativo no caixa); venda: receita (+)
  symbol?: string;
  priceUsd?: number;
  note?: string;
};

export type WalletPosition = {
  id: string;
  tokenKey: string;
  chainId: string;
  symbol: string;
  name: string;
  address?: string; // sem contrato = sem preço vivo (posição "no papel")
  entryPriceUsd: number;
  shares: number; // tokens em carteira
  costEur: number; // custo-base em euros
  openedAt: string;
  tpPct: number; // regras de saída capturadas no momento da compra
  slPct: number;
};

export type ClosedPosition = WalletPosition & {
  closedAt: string;
  exitPriceUsd: number;
  pnlEur: number;
};

export type WalletState = {
  startedAt: string;
  cash: number;
  positions: WalletPosition[];
  closed: ClosedPosition[];
  txs: WalletTx[];
  equityHistory: EquityPoint[];
};

export const START_CASH = 100;
const EQUITY_CAP = 2880; // ~8h a cada 10s (o suficiente para uma sessão)
const TX_CAP = 400;

export function freshWallet(): WalletState {
  const t = new Date().toISOString();
  return {
    startedAt: t,
    cash: START_CASH,
    positions: [],
    closed: [],
    txs: [
      {
        id: "seed",
        t,
        kind: "deposit",
        eur: START_CASH,
        note: "Carteira de treino criada",
      },
    ],
    equityHistory: [],
  };
}

/** tokenKey -> preço USD ao vivo (só posições com contrato). */
export type LivePrices = Map<string, number>;

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Valor da posição em € a preço vivo, ou null sem preço. */
export function positionValueEur(
  pos: WalletPosition,
  live: LivePrices,
  usdEur: number,
): number | null {
  const price = pos.address ? live.get(pos.tokenKey) : undefined;
  if (!price || !(price > 0) || !(usdEur > 0)) return null;
  return (pos.shares * price) / usdEur;
}

/** Total da carteira = caixa + posições (sem preço vivo ficam ao custo). */
export function walletEquity(
  state: WalletState,
  live: LivePrices,
  usdEur: number,
): number {
  const pos = state.positions.reduce(
    (s, p) => s + (positionValueEur(p, live, usdEur) ?? p.costEur),
    0,
  );
  return round2(state.cash + pos);
}

export function totalDeposited(state: WalletState): number {
  return round2(
    state.txs
      .filter((t) => t.kind === "deposit")
      .reduce((s, t) => s + t.eur, 0),
  );
}

export type OpResult =
  | { ok: true; state: WalletState; proceedsEur?: number; pnlEur?: number }
  | { ok: false; error: string };

export type BuyInput = {
  chainId: string;
  address?: string;
  symbol: string;
  name: string;
  priceUsd: number;
  costEur: number;
  usdEur: number;
  tpPct: number;
  slPct: number;
  note?: string;
};

export function buyToWallet(state: WalletState, input: BuyInput): OpResult {
  const cost = round2(input.costEur);
  if (!Number.isFinite(cost) || !(cost > 0))
    return { ok: false, error: "Monto inválido." };
  if (!Number.isFinite(input.priceUsd) || !(input.priceUsd > 0))
    return {
      ok: false,
      error: "Sem preço válido — não há como comprar no zero.",
    };
  if (!(input.usdEur > 0))
    return { ok: false, error: "Câmbio USD/EUR indisponível." };
  if (cost > state.cash + 1e-9)
    return {
      ok: false,
      error: `Caixa insuficiente — tens ${state.cash.toFixed(2)}€ disponíveis.`,
    };

  const shares = (cost * input.usdEur) / input.priceUsd;
  const now = new Date().toISOString();
  const key = input.address
    ? tokenKey(input.chainId, input.address)
    : `manual:${input.chainId}:${input.symbol.toLowerCase()}:${Date.now()}`;

  const existing = state.positions.find((p) => p.tokenKey === key);
  let positions: WalletPosition[];
  if (existing) {
    // Média de entrada (mais tokens da mesma moeda → posição única).
    const totalShares = existing.shares + shares;
    const entry =
      (existing.shares * existing.entryPriceUsd + shares * input.priceUsd) /
      totalShares;
    positions = state.positions.map((p) =>
      p.id === existing.id
        ? {
            ...p,
            shares: totalShares,
            costEur: p.costEur + cost,
            entryPriceUsd: entry,
          }
        : p,
    );
  } else {
    positions = [
      ...state.positions,
      {
        id: crypto.randomUUID(),
        tokenKey: key,
        chainId: input.chainId,
        symbol: input.symbol,
        name: input.name,
        address: input.address,
        entryPriceUsd: input.priceUsd,
        shares,
        costEur: cost,
        openedAt: now,
        tpPct: input.tpPct,
        slPct: input.slPct,
      },
    ];
  }

  const txs = pushTx(state.txs, {
    id: crypto.randomUUID(),
    t: now,
    kind: "buy",
    eur: -cost,
    symbol: input.symbol,
    priceUsd: input.priceUsd,
    note: input.note,
  });

  return {
    ok: true,
    state: { ...state, cash: round2(state.cash - cost), positions, txs },
  };
}

export function sellFromWallet(
  state: WalletState,
  args: {
    positionId: string;
    priceUsd: number;
    usdEur: number;
    fraction?: number; // 1 = tudo; 0.5 = metade
    note?: string;
  },
): OpResult {
  const pos = state.positions.find((p) => p.id === args.positionId);
  if (!pos) return { ok: false, error: "Posição não encontrada." };
  if (!Number.isFinite(args.priceUsd) || !(args.priceUsd > 0))
    return { ok: false, error: "Sem preço vivo para vender." };
  if (!(args.usdEur > 0))
    return { ok: false, error: "Câmbio USD/EUR indisponível." };
  const f = Math.min(1, Math.max(0, args.fraction ?? 1));
  if (f <= 0) return { ok: false, error: "Fração inválida." };

  const sellShares = pos.shares * f;
  const proceeds = round2((sellShares * args.priceUsd) / args.usdEur);
  const costPart = pos.costEur * f;
  const pnl = round2(proceeds - costPart);
  const now = new Date().toISOString();

  // TODA a venda (parcial ou total) regista uma "tranche" fechada — senão o
  // P&L de um "vender 50%" ficava só na nota do tx e o realized/win rate
  // subcontavam. shares/costEur na tranche = a parte vendida.
  const tranche: ClosedPosition = {
    ...pos,
    id: f >= 1 ? pos.id : `${pos.id}:${Math.round(f * 100)}:${now}`,
    shares: sellShares,
    costEur: round2(costPart),
    closedAt: now,
    exitPriceUsd: args.priceUsd,
    pnlEur: pnl,
  };

  const positions: WalletPosition[] =
    f >= 1
      ? state.positions.filter((p) => p.id !== pos.id)
      : state.positions.map((p) =>
          p.id === pos.id
            ? {
                ...p,
                shares: p.shares * (1 - f),
                costEur: round2(p.costEur * (1 - f)),
              }
            : p,
        );
  const closed = [...state.closed, tranche];

  const txs = pushTx(state.txs, {
    id: crypto.randomUUID(),
    t: now,
    kind: "sell",
    eur: proceeds,
    symbol: pos.symbol,
    priceUsd: args.priceUsd,
    note: `${f >= 1 ? "Venda total" : `Venda ${Math.round(f * 100)}%`} · P&L ${
      pnl >= 0 ? "+" : ""
    }${pnl.toFixed(2)}€${args.note ? ` · ${args.note}` : ""}`,
  });

  return {
    ok: true,
    state: {
      ...state,
      cash: round2(state.cash + proceeds),
      positions,
      closed,
      txs,
    },
    proceedsEur: proceeds,
    pnlEur: pnl,
  };
}

export function depositToWallet(state: WalletState, eur: number): OpResult {
  const v = round2(eur);
  if (!Number.isFinite(v) || !(v > 0))
    return { ok: false, error: "Monto inválido." };
  const now = new Date().toISOString();
  const txs = pushTx(state.txs, {
    id: crypto.randomUUID(),
    t: now,
    kind: "deposit",
    eur: v,
    note: "Depósito de treino (fictício)",
  });
  return { ok: true, state: { ...state, cash: round2(state.cash + v), txs } };
}

/** Snapshot de equity para o gráfico; ignora pontos a <8s do anterior
 * (o tick da Carteira é de 10s; o resto é ruído). */
export function withEquitySnapshot(
  state: WalletState,
  equity: number,
  now = Date.now(),
): WalletState {
  const last = state.equityHistory[state.equityHistory.length - 1];
  if (last && now - last.t < 8_000) return state;
  const point: EquityPoint = { t: now, equity: round2(equity) };
  const equityHistory = [...state.equityHistory, point].slice(-EQUITY_CAP);
  return { ...state, equityHistory };
}

export type WalletStats = {
  equity: number;
  cash: number;
  deployed: number;
  totalDeposited: number;
  totalPnlEur: number;
  totalPnlPct: number;
  realizedEur: number;
  unrealizedEur: number;
  closedCount: number;
  winCount: number;
  winRate: number | null; // % ou null (sem trades fechados)
  best: ClosedPosition | null;
  worst: ClosedPosition | null;
  maxDrawdownPct: number;
};

export function walletStats(
  state: WalletState,
  live: LivePrices,
  usdEur: number,
): WalletStats {
  const equity = walletEquity(state, live, usdEur);
  const deposits = totalDeposited(state);

  let deployed = 0;
  let unrealized = 0;
  for (const p of state.positions) {
    const v = positionValueEur(p, live, usdEur);
    deployed += v ?? p.costEur;
    if (v != null) unrealized += v - p.costEur;
  }
  deployed = round2(deployed);
  unrealized = round2(unrealized);

  const realized = round2(state.closed.reduce((s, c) => s + c.pnlEur, 0));
  const totalPnl = round2(equity - deposits);
  const totalPnlPct =
    deposits > 0 ? (totalPnl / deposits) * 100 : 0;

  const winCount = state.closed.filter((c) => c.pnlEur > 0).length;
  const winRate =
    state.closed.length > 0
      ? Math.round((winCount / state.closed.length) * 100)
      : null;

  let best: ClosedPosition | null = null;
  let worst: ClosedPosition | null = null;
  for (const c of state.closed) {
    if (!best || c.pnlEur > best.pnlEur) best = c;
    if (!worst || c.pnlEur < worst.pnlEur) worst = c;
  }

  // Max drawdown: pico → vazio na curva de equity (+ o ponto atual).
  let peak = -Infinity;
  let mdd = 0;
  const consider = (v: number) => {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.max(mdd, ((peak - v) / peak) * 100);
  };
  for (const pt of state.equityHistory) consider(pt.equity);
  consider(equity);

  return {
    equity,
    cash: state.cash,
    deployed,
    totalDeposited: deposits,
    totalPnlEur: totalPnl,
    totalPnlPct,
    realizedEur: realized,
    unrealizedEur: unrealized,
    closedCount: state.closed.length,
    winCount,
    winRate,
    best,
    worst,
    maxDrawdownPct: Math.round(mdd * 10) / 10,
  };
}

function pushTx(txs: WalletTx[], tx: WalletTx): WalletTx[] {
  return [...txs, tx].slice(-TX_CAP);
}
