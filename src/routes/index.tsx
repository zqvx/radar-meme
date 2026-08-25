import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Loader2, Radar as RadarIcon, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { RadarField } from "@/components/radar-field";
import { TokenCard } from "@/components/token-card";
import { Button } from "@/components/ui/button";
import { scanRadar } from "@/lib/dex-api";
import { ageMs, chainLabel, tokenKey } from "@/lib/format";
import { useWatchlist } from "@/lib/storage";
import type { ScoredToken } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: RadarPage });

type SortKey =
  | "score"
  | "potential"
  | "h24"
  | "h1"
  | "mcap"
  | "volume"
  | "liquidity";

const SORT_LABELS: Record<SortKey, string> = {
  score: "Score",
  potential: "Potencial mcap $1M",
  h24: "Momentum 24h",
  h1: "Momentum 1h",
  mcap: "Mcap ↑ (runway)",
  volume: "Volume 24h",
  liquidity: "Liquidez",
};

type AgeKey = "any" | "2h" | "12h" | "7d" | "7d+";

const AGE_MS: Record<Exclude<AgeKey, "any" | "7d+">, number> = {
  "2h": 2 * 3_600_000,
  "12h": 12 * 3_600_000,
  "7d": 7 * 86_400_000,
};

function potential1m(t: ScoredToken): number {
  return t.marketCap > 0 ? 1_000_000 / t.marketCap : 0;
}

function RadarPage() {
  const qc = useQueryClient();
  const [watchlist, setWatchlist] = useWatchlist();
  const [chain, setChain] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [watchOnly, setWatchOnly] = useState(false);
  const [hideFlagged, setHideFlagged] = useState(false);
  const [sort, setSort] = useState<SortKey>("score");
  const [mcapMin, setMcapMin] = useState(0);
  const [age, setAge] = useState<AgeKey>("any");

  const query = useQuery({
    queryKey: ["radar"],
    queryFn: () => scanRadar(),
    staleTime: 20_000,
  });

  const refresh = useMutation({
    mutationFn: () => scanRadar(),
    onSuccess: (data) => {
      qc.setQueryData(["radar"], data);
    },
  });

  const payload = query.data;
  const tokens: ScoredToken[] = payload && payload.ok ? payload.tokens : [];
  const scanning = query.isFetching || refresh.isPending;
  const error =
    query.isError
      ? "Não foi possível contactar a DexScreener."
      : payload && !payload.ok
        ? payload.error
        : null;

  const chains = useMemo(() => {
    const set = new Set(tokens.map((t) => t.chainId));
    return [...set].sort();
  }, [tokens]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const arr = tokens.filter((t) => {
      if (chain !== "all" && t.chainId !== chain) return false;
      if (t.score.auto < minScore) return false;
      if (watchOnly && !watchlist.includes(tokenKey(t.chainId, t.tokenAddress)))
        return false;
      if (hideFlagged && t.score.flags.some((f) => f.severity === "bad"))
        return false;
      // Filtro de lucro: runway de mcap (so micro-caps com espaço até $1M).
      if (mcapMin > 0 && (t.marketCap <= 0 || t.marketCap < mcapMin))
        return false;
      // Idade do par: <7d = janela clássica de meme; >7d = já "amadureceu".
      if (age !== "any") {
        const ms = ageMs(t.pairCreatedAt, now);
        if (Number.isNaN(ms)) return false;
        if (age === "7d+") {
          if (ms < 7 * 86_400_000) return false;
        } else if (ms >= AGE_MS[age]) {
          return false;
        }
      }
      return true;
    });
    const bySort: Record<SortKey, (a: ScoredToken, b: ScoredToken) => number> =
      {
        score: (a, b) =>
          b.score.auto - a.score.auto || potential1m(b) - potential1m(a),
        potential: (a, b) =>
          potential1m(b) - potential1m(a) || b.score.auto - a.score.auto,
        h24: (a, b) => b.priceChangeH24 - a.priceChangeH24,
        h1: (a, b) => b.priceChangeH1 - a.priceChangeH1,
        mcap: (a, b) =>
          (a.marketCap || Infinity) - (b.marketCap || Infinity),
        volume: (a, b) => b.volumeH24 - a.volumeH24,
        liquidity: (a, b) => b.liquidityUsd - a.liquidityUsd,
      };
    return [...arr].sort(bySort[sort]);
  }, [tokens, chain, minScore, watchOnly, watchlist, hideFlagged, sort, mcapMin, age]);

  const avg =
    tokens.length > 0
      ? Math.round(tokens.reduce((s, t) => s + t.score.auto, 0) / tokens.length)
      : 0;

  function toggleWatch(key: string) {
    setWatchlist((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <div>
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs tracking-widest text-subtle uppercase">
            Radar
          </p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">
            Tokens promovidos, pontuados.
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            Boosts e perfis novos da DexScreener. Score automático 0–80: idade,
            mcap, vol/mcap, liquidez e momentum, menos red flags.
          </p>
        </div>
        <Button
          onClick={() => refresh.mutate()}
          disabled={scanning}
          className="w-full sm:w-auto"
        >
          {scanning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {scanning ? "A escanear…" : "Escanear agora"}
        </Button>
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Kpi label="No ar" value={String(tokens.length)} />
        <Kpi label="Score médio" value={tokens.length ? String(avg) : "—"} />
        <Kpi
          label="Na watchlist"
          value={String(watchlist.length)}
        />
      </section>

      <section className="mt-8 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)] sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted">
          <Filter className="size-4" />
          Filtros
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-subtle">
            Chain
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="h-11 rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="all">Todas</option>
              {chains.map((c) => (
                <option key={c} value={c}>
                  {chainLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-subtle">
            Score mínimo
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="h-11 rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value={0}>Qualquer</option>
              <option value={25}>25+</option>
              <option value={40}>40+</option>
              <option value={55}>55+</option>
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-subtle">
            Ordenar por
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-11 rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-subtle">
            Mcap mínimo
            <select
              value={mcapMin}
              onChange={(e) => setMcapMin(Number(e.target.value))}
              className="h-11 rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value={0}>Qualquer</option>
              <option value={50000}>≥ $50k</option>
              <option value={100000}>≥ $100k</option>
              <option value={250000}>≥ $250k</option>
              <option value={500000}>≥ $500k</option>
              <option value={1000000}>≥ $1M</option>
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-subtle">
            Idade do par
            <select
              value={age}
              onChange={(e) => setAge(e.target.value as AgeKey)}
              className="h-11 rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="any">Qualquer</option>
              <option value="2h">Novo &lt; 2h</option>
              <option value="12h">&lt; 12h</option>
              <option value="7d">&lt; 7 dias</option>
              <option value="7d+">&gt; 7 dias</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2 lg:pt-5">
            <Toggle pressed={watchOnly} onPressed={() => setWatchOnly((v) => !v)}>
              Só watchlist
            </Toggle>
            <Toggle
              pressed={hideFlagged}
              onPressed={() => setHideFlagged((v) => !v)}
            >
              Esconder dumps
            </Toggle>
          </div>
        </div>
      </section>

      {error ? (
        <p className="mt-8 rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </p>
      ) : null}

      {scanning && tokens.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-6 text-center">
          <RadarField scanning className="max-w-56" />
          <p className="text-muted">A varrer boosts e perfis…</p>
        </div>
      ) : null}

      {!scanning && tokens.length === 0 && !error ? (
        <div className="mt-16 flex flex-col items-center gap-6 text-center">
          <RadarField />
          <div>
            <RadarIcon className="mx-auto mb-3 size-5 text-muted" />
            <p className="text-fg">Nada no ecrã ainda.</p>
            <p className="mt-1 text-sm text-muted">
              Corre um scan para puxar tokens promovidos.
            </p>
          </div>
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {filtered.map((t) => (
            <TokenCard
              key={tokenKey(t.chainId, t.tokenAddress)}
              token={t}
              watched={watchlist.includes(tokenKey(t.chainId, t.tokenAddress))}
              onToggleWatch={toggleWatch}
            />
          ))}
        </div>
      ) : tokens.length > 0 ? (
        <p className="mt-10 text-center text-sm text-muted">
          Nenhum token com estes filtros.
        </p>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function Toggle({
  pressed,
  onPressed,
  children,
}: {
  pressed: boolean;
  onPressed: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPressed}
      className={cn(
        "h-11 rounded-md px-3 text-sm transition-colors duration-150",
        pressed
          ? "bg-accent text-accent-fg"
          : "bg-elevated text-muted shadow-[var(--shadow-border)] hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
