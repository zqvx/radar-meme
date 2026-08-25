import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ExternalLink, Loader2, ScanSearch, ScanText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ScoreRing } from "@/components/score-ring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiAvailable, readNarrative } from "@/lib/ai";
import { BuyPanel } from "@/components/buy-panel";
import { xrayToken } from "@/lib/dex-api";
import {
  chainLabel,
  formatAge,
  formatPct,
  formatUsd,
  tokenKey,
} from "@/lib/format";
import { MANUAL_ITEMS, scoreToken } from "@/lib/scoring";
import { emptyManual, useManualMap } from "@/lib/storage";
import type { ManualChecks, ScoredToken } from "@/lib/types";
import { cn, shortAddress } from "@/lib/utils";

type Search = { q: string; chain?: string };

export const Route = createFileRoute("/xray")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === "string" ? s.q : "",
    chain: typeof s.chain === "string" ? s.chain : undefined,
  }),
  component: XRayPage,
});

function XRayPage() {
  const { q, chain } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [input, setInput] = useState(q);
  const [manualMap, setManualMap] = useManualMap();
  const [token, setToken] = useState<ScoredToken | null>(null);

  const lookup = useMutation({
    mutationFn: (payload: { address: string; chainId?: string }) =>
      xrayToken({ data: payload }),
    onSuccess: (res) => {
      if (res.ok) setToken(res.token);
      else setToken(null);
    },
  });

  useEffect(() => {
    setInput(q);
    if (q.trim().length >= 2) {
      lookup.mutate({ address: q, chainId: chain });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, chain]);

  const key = token ? tokenKey(token.chainId, token.tokenAddress) : "";
  const manual = (key && manualMap[key]) || emptyManual;

  const scored = useMemo(() => {
    if (!token) return null;
    return {
      ...token,
      score: scoreToken(
        {
          pairCreatedAt: token.pairCreatedAt,
          marketCap: token.marketCap,
          volumeH24: token.volumeH24,
          liquidityUsd: token.liquidityUsd,
          priceChangeH1: token.priceChangeH1,
          priceChangeH24: token.priceChangeH24,
          buysH24: token.buysH24,
          sellsH24: token.sellsH24,
          boostsActive: token.boostsActive,
          hasSocials: token.socials.length > 0,
        },
        manual,
      ),
    };
  }, [token, manual]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const address = input.trim();
    if (address.length < 2) return;
    navigate({ search: { q: address, chain } });
  }

  function setCheck(k: keyof ManualChecks, v: boolean) {
    if (!key) return;
    setManualMap((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? emptyManual), [k]: v },
    }));
  }

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-subtle uppercase">
        X-Ray
      </p>
      <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">
        Cola o contrato.
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Métricas ao vivo, score 0–100 e checklist. A mcap desconhecida não
        ganha pontos de “mcap pequena”.
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Contrato, ticker ou nome"
          spellCheck={false}
          className="font-mono"
          aria-label="Contrato ou ticker"
        />
        <Button
          type="submit"
          disabled={lookup.isPending || input.trim().length < 2}
          className="sm:w-40"
        >
          {lookup.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ScanSearch className="size-4" />
          )}
          Analisar
        </Button>
      </form>
      {input.trim() && input.trim().length < 2 ? (
        <p className="mt-2 text-sm text-warn">Escreve um contrato ou ticker.</p>
      ) : null}

      {lookup.isError || (lookup.data && !lookup.data.ok) ? (
        <p className="mt-6 rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad">
          {lookup.data && !lookup.data.ok
            ? lookup.data.error
            : "Falha a contactar a DexScreener."}
        </p>
      ) : null}

      {scored ? <XRayResult token={scored} manual={manual} onCheck={setCheck} /> : null}
    </div>
  );
}

function XRayResult({
  token,
  manual,
  onCheck,
}: {
  token: ScoredToken;
  manual: ManualChecks;
  onCheck: (k: keyof ManualChecks, v: boolean) => void;
}) {
  const aiQuery = useQuery({
    queryKey: ["ai-available"],
    queryFn: () => aiAvailable(),
    staleTime: 60_000,
  });
  const narrative = useMutation({
    mutationFn: () =>
      readNarrative({
        data: {
          name: token.name,
          symbol: token.symbol,
          description: token.description,
          socials: token.socials.map((s) => s.platform).join(", "),
          marketCap: token.marketCap,
          age: formatAge(token.pairCreatedAt),
          flags: token.score.flags.map((f) => f.label).join(", "),
        },
      }),
  });

  const tone =
    token.score.verdict === "go"
      ? "text-good"
      : token.score.verdict === "caution"
        ? "text-warn"
        : "text-bad";

  return (
    <div className="mt-10 space-y-6">
      <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-elevated shadow-[var(--shadow-border)]">
              <span className="absolute inset-0 flex items-center justify-center font-mono text-muted">
                {(token.symbol || "?").slice(0, 1)}
              </span>
              {token.imageUrl ? (
                <img
                  src={token.imageUrl}
                  alt=""
                  className="relative z-10 size-full object-cover outline outline-1 -outline-offset-1 outline-fg/10"
                />
              ) : null}
            </div>
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-medium tracking-tight">{token.symbol}</h2>
              <span className="rounded-full bg-elevated px-2 py-0.5 font-mono text-xs text-muted">
                {chainLabel(token.chainId)}
              </span>
            </div>
            <p className="text-muted">{token.name}</p>
            <p className="mt-1 font-mono text-xs text-subtle">
              {shortAddress(token.tokenAddress, 6)}
            </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing value={token.score.total} max={100} size={72} />
            <div>
              <p className={cn("text-lg font-medium", tone)}>
                {token.score.verdictLabel}
              </p>
              <p className="font-mono text-sm tabular-nums text-muted">
                {token.score.total}/100 · auto {token.score.auto}/80
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Preço" value={formatUsd(token.priceUsd, false)} />
          <Metric label="Mcap" value={formatUsd(token.marketCap)} />
          <Metric label="LP" value={formatUsd(token.liquidityUsd)} />
          <Metric label="Vol 24h" value={formatUsd(token.volumeH24)} />
          <Metric label="24h" value={formatPct(token.priceChangeH24)} />
          <Metric label="1h" value={formatPct(token.priceChangeH1)} />
          <Metric label="Idade" value={formatAge(token.pairCreatedAt)} />
          <Metric
            label="Buys/Sells 24h"
            value={`${token.buysH24}/${token.sellsH24}`}
          />
        </dl>

        {token.marketCap > 0 ? (
          <div className="mt-5 rounded-lg bg-elevated p-3">
            <p className="text-xs text-subtle">
              Runway de mcap — quanto faltaria até estes marcos (aritmética,
              não previsão):
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              {[1_000_000, 3_000_000, 10_000_000].map((v) => (
                <div key={v} className="rounded-md bg-bg px-2 py-2">
                  <dt className="font-mono text-subtle">mcap {formatUsd(v)}</dt>
                  <dd
                    className={cn(
                      "mt-0.5 font-mono text-sm tabular-nums",
                      v >= token.marketCap ? "text-good" : "text-subtle",
                    )}
                  >
                    {(v / token.marketCap).toFixed(1)}×
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {token.description ? (
          <p className="mt-5 text-sm leading-relaxed text-muted">
            {token.description}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {token.websites.map((url) => {
            let label = "Site";
            try {
              label = new URL(url).hostname.replace(/^www\./, "");
            } catch {
              /* keep */
            }
            return (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1 rounded-full bg-elevated px-3 text-xs text-muted hover:text-fg"
              >
                {label} <ExternalLink className="size-3" />
              </a>
            );
          })}
          {token.socials.map((s, i) => {
            const href = s.url;
            const cls =
              "inline-flex h-9 items-center rounded-full bg-elevated px-3 text-xs text-muted hover:text-fg";
            const label = s.platform + (s.handle ? ` · ${s.handle}` : "");
            return href ? (
              <a
                key={`${s.platform}-${i}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                className={cls}
              >
                {label}
              </a>
            ) : (
              <span key={`${s.platform}-${i}`} className={cls}>
                {label}
              </span>
            );
          })}
          <a
            href={token.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1 rounded-full bg-elevated px-3 text-xs text-muted hover:text-fg"
          >
            DexScreener <ExternalLink className="size-3" />
          </a>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <h3 className="font-medium">Checklist automático</h3>
          <ul className="mt-4 space-y-3">
            {token.score.slices.map((s) => (
              <li key={s.key} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm">{s.label}</p>
                  <p className="text-xs text-muted">{s.detail}</p>
                </div>
                <span className="font-mono text-sm tabular-nums text-muted">
                  {s.points}/{s.max}
                </span>
              </li>
            ))}
          </ul>
          {token.score.flags.length > 0 ? (
            <ul className="mt-5 space-y-2">
              {token.score.flags.map((f) => (
                <li
                  key={f.code}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm",
                    f.severity === "bad"
                      ? "bg-bad/10 text-bad"
                      : "bg-warn/10 text-warn",
                  )}
                >
                  <span className="font-medium">{f.label}</span>
                  {f.penalty ? ` · −${f.penalty}` : ""}
                  <p className="text-xs opacity-80">{f.detail}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <h3 className="font-medium">Checklist manual · +20</h3>
          <p className="mt-1 text-sm text-muted">
            Só marca o que confirmaste tu. Fica guardado neste browser.
          </p>
          <ul className="mt-4 space-y-2">
            {MANUAL_ITEMS.map((item) => {
              const on = manual[item.key];
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onCheck(item.key, !on)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors duration-150",
                      on ? "bg-good/10" : "bg-elevated",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 items-center justify-center rounded-sm",
                        on ? "bg-good text-accent-fg" : "bg-bg text-subtle",
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    <span>
                      <span className="block text-sm">
                        {item.label}{" "}
                        <span className="font-mono text-xs text-muted">
                          +{item.points}
                        </span>
                      </span>
                      <span className="block text-xs text-muted">{item.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-5">
            <BuyPanel
              token={{
                chainId: token.chainId,
                address: token.tokenAddress,
                symbol: token.symbol,
                name: token.name,
                hintPriceUsd: token.priceUsd,
              }}
            />
          </div>
          <Link
            to="/diario"
            search={{ ca: token.tokenAddress, chain: token.chainId, name: token.symbol }}
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-md bg-elevated text-sm font-medium text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]"
          >
            Gerir na Carteira
          </Link>
        </div>
      </section>

      {aiQuery.data?.available ? (
        <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-medium">Leitura da narrativa</h3>
              <p className="text-sm text-muted">
                Um olhar céptico sobre a tese — não é um sinal de compra.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => narrative.mutate()}
              disabled={narrative.isPending}
            >
              {narrative.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanText className="size-4" />
              )}
              Ler narrativa
            </Button>
          </div>
          {narrative.data?.ok ? (
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted">
              {narrative.data.text}
            </pre>
          ) : null}
          {narrative.data && !narrative.data.ok ? (
            <p className="mt-3 text-sm text-bad">{narrative.data.error}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}
