import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert, SkipForward, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { RadarField } from "@/components/radar-field";
import { Button } from "@/components/ui/button";
import { scanRadar } from "@/lib/dex-api";
import { chainLabel, formatAge, formatEur, formatPct, formatUsd } from "@/lib/format";
import { useBets } from "@/lib/storage";
import type { Bet, ScoredToken } from "@/lib/types";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/pick")({ component: PickPage });

// Limiar mínimo para sequer entrar na consideração — abaixo disto nem
// aparece como "escolha automática", mesmo que seja o melhor do lote.
const MIN_SCORE = 45;

function rankCandidates(tokens: ScoredToken[]): ScoredToken[] {
  return tokens
    .filter((t) => t.score.verdict !== "avoid")
    .filter((t) => !t.score.flags.some((f) => f.severity === "bad"))
    .filter((t) => t.score.auto >= MIN_SCORE)
    .sort((a, b) => b.score.auto - a.score.auto);
}

function PickPage() {
  const [bets, setBets] = useBets();
  const [skip, setSkip] = useState(0);
  const [loggedKey, setLoggedKey] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["radar"],
    queryFn: () => scanRadar(),
    staleTime: 20_000,
  });

  const payload = query.data;
  const tokens: ScoredToken[] = payload && payload.ok ? payload.tokens : [];
  const candidates = useMemo(() => rankCandidates(tokens), [tokens]);
  const pick = candidates[skip % Math.max(candidates.length, 1)] ?? null;
  const key = pick ? `${pick.chainId}:${pick.tokenAddress}` : null;
  const alreadyBet = key
    ? bets.some((b) => b.address && `${b.chainId}:${b.address}` === key)
    : false;

  function registerBet() {
    if (!pick) return;
    const bet: Bet = {
      id: crypto.randomUUID(),
      name: pick.symbol,
      address: pick.tokenAddress,
      chainId: pick.chainId,
      stakeEur: 1,
      entryPriceUsd: pick.priceUsd,
      entryAt: new Date().toISOString(),
      notes: `Pick automático (score ${pick.score.auto}/80): ${topReasons(pick).join("; ")}`,
    };
    setBets((prev) => [bet, ...prev]);
    setLoggedKey(key);
    toast.success(`1€ registado em ${pick.symbol}. Já está.`);
  }

  const loading = query.isFetching && tokens.length === 0;

  return (
    <div className="mx-auto max-w-xl">
      <header>
        <p className="font-mono text-xs tracking-widest text-subtle uppercase">
          Pick automático
        </p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">
          Uma escolha. Zero scroll.
        </h1>
        <p className="mt-2 text-muted">
          Score ≥ {MIN_SCORE}, sem red flags graves, o mais bem pontuado agora.
          Continua a ser especulação de alto risco — automatizar a escolha não
          remove o risco, só a fricção.
        </p>
      </header>

      <section className="mt-8">
        {loading ? (
          <div className="flex flex-col items-center gap-6 py-16 text-center">
            <RadarField scanning className="max-w-56" />
            <p className="text-muted">A escolher…</p>
          </div>
        ) : !pick ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-surface py-16 text-center shadow-[var(--shadow-border)]">
            <ShieldAlert className="size-6 text-muted" />
            <p className="text-fg">Nada bom o suficiente agora.</p>
            <p className="max-w-sm text-sm text-muted">
              Nenhum token no ar passa no limiar de score/red-flags. Volta
              daqui a pouco em vez de baixares a fasquia.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-surface p-6 shadow-[var(--shadow-border)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-medium tracking-tight">
                    {pick.symbol}
                  </p>
                  <span className="rounded-full bg-elevated px-2 py-0.5 text-xs text-muted">
                    {chainLabel(pick.chainId)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted">{pick.name}</p>
              </div>
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-good text-lg font-mono font-medium text-good">
                {pick.score.auto}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Metric label="Idade" value={formatAge(pick.pairCreatedAt)} />
              <Metric label="24h" value={formatPct(pick.priceChangeH24)} />
              <Metric label="Mcap" value={formatUsd(pick.marketCap)} />
              <Metric label="Liquidez" value={formatUsd(pick.liquidityUsd)} />
            </dl>

            <ul className="mt-5 space-y-1.5 text-sm text-muted">
              {topReasons(pick).map((r) => (
                <li key={r} className="flex gap-2">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-good" />
                  {r}
                </li>
              ))}
              {pick.score.flags
                .filter((f) => f.severity === "warn")
                .map((f) => (
                  <li key={f.code} className="flex gap-2 text-warn">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                    {f.label}
                  </li>
                ))}
            </ul>

            <div className="mt-5 rounded-lg bg-elevated p-3">
              <p className="text-xs text-subtle">
                Se o teu 1€ multiplicar (aritmética, não previsão — a maioria
                nem chega a 2×):
              </p>
              <dl className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                {[2, 5, 10, 20].map((m) => (
                  <div key={m}>
                    <dt className="font-mono text-subtle">{m}×</dt>
                    <dd className="font-mono tabular-nums text-good">
                      +{formatEur(m - 1)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="mt-6 flex gap-2">
              <Button
                onClick={registerBet}
                disabled={alreadyBet || loggedKey === key}
                className="flex-1"
              >
                {loggedKey === key
                  ? "Registado ✓"
                  : alreadyBet
                    ? "Já tens esta"
                    : "Meter 1€ nisto"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setSkip((s) => s + 1)}
                disabled={candidates.length <= 1}
                title="Ver a próxima melhor opção"
              >
                <SkipForward className="size-4" />
              </Button>
            </div>
          </div>
        )}

        <Button
          variant="secondary"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="mt-4 w-full"
        >
          {query.isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          Escolher de novo
        </Button>
      </section>
    </div>
  );
}

function topReasons(t: ScoredToken): string[] {
  return [...t.score.slices]
    .filter((s) => s.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((s) => s.detail || s.label);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono tabular-nums">{value}</dd>
    </div>
  );
}
