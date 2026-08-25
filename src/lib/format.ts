const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const EUR = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

export function formatUsd(value: number, compact = true): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  if (!compact) {
    if (value >= 1) return USD.format(value);
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toPrecision(3)}`;
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${abs.toFixed(4)}`;
  return `${sign}$${abs.toPrecision(3)}`;
}

export function formatEur(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return EUR.format(value);
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatAge(createdAt: number, now = Date.now()): string {
  if (!createdAt || createdAt <= 0) return "idade ?";
  const ms = Math.max(0, now - createdAt);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mes`;
}

export function ageMs(createdAt: number, now = Date.now()): number {
  if (!createdAt || createdAt <= 0) return Number.NaN;
  return Math.max(0, now - createdAt);
}

export function chainLabel(chainId: string): string {
  const map: Record<string, string> = {
    solana: "Solana",
    ethereum: "Ethereum",
    base: "Base",
    bsc: "BSC",
    arbitrum: "Arbitrum",
    polygon: "Polygon",
    avalanche: "Avalanche",
    optimism: "Optimism",
    pulsechain: "Pulse",
    sui: "Sui",
    ton: "TON",
    hyperevm: "HyperEVM",
    monad: "Monad",
  };
  return map[chainId] ?? chainId;
}

export function tokenKey(chainId: string, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}
