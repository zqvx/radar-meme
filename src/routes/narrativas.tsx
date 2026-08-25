import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Layers, Loader2 } from "lucide-react";
import { useState } from "react";
import { TokenCard } from "@/components/token-card";
import { Button } from "@/components/ui/button";
import { getMetaDetail, getTrendingMetas } from "@/lib/dex-api";
import { formatPct, formatUsd, tokenKey } from "@/lib/format";
import { useWatchlist } from "@/lib/storage";
import type { MetaDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/narrativas")({
  component: NarrativasPage,
});

function NarrativasPage() {
  const [watchlist, setWatchlist] = useWatchlist();
  const [open, setOpen] = useState<MetaDetail | null>(null);

  const metas = useQuery({
    queryKey: ["metas"],
    queryFn: () => getTrendingMetas(),
    staleTime: 30_000,
  });

  const detail = useMutation({
    mutationFn: (slug: string) => getMetaDetail({ data: { slug } }),
    onSuccess: (res) => {
      if (res.ok) setOpen(res.detail);
    },
  });

  const list = metas.data?.ok ? metas.data.metas : [];

  function toggleWatch(key: string) {
    setWatchlist((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  if (open) {
    return (
      <div>
        <Button variant="ghost" onClick={() => setOpen(null)} className="px-0">
          <ChevronLeft className="size-4" />
          Narrativas
        </Button>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">{open.name}</h1>
        {open.description ? (
          <p className="mt-2 max-w-2xl text-muted">{open.description}</p>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Mcap do meta" value={formatUsd(open.marketCap)} />
          <Kpi label="Volume" value={formatUsd(open.volume)} />
          <Kpi label="Tokens" value={String(open.tokenCount)} />
          <Kpi
            label="24h"
            value={
              open.marketCapChangeH24 != null
                ? formatPct(open.marketCapChangeH24)
                : "—"
            }
          />
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {open.tokens.map((t) => (
            <TokenCard
              key={tokenKey(t.chainId, t.tokenAddress)}
              token={t}
              watched={watchlist.includes(tokenKey(t.chainId, t.tokenAddress))}
              onToggleWatch={toggleWatch}
            />
          ))}
        </div>
        {open.tokens.length === 0 ? (
          <p className="mt-10 text-sm text-muted">Sem pares neste meta.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-subtle uppercase">
        Narrativas
      </p>
      <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">
        O que está a circular.
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        Metas em tendência na DexScreener. Entra num cluster e vê os tokens já
        pontuados.
      </p>

      {metas.isFetching ? (
        <p className="mt-10 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> A puxar metas…
        </p>
      ) : null}

      {metas.isError || (metas.data && !metas.data.ok) ? (
        <p className="mt-8 text-sm text-bad">Não foi possível carregar narrativas.</p>
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => {
          const chg = m.marketCapChangeH24;
          return (
            <button
              key={m.slug}
              type="button"
              onClick={() => detail.mutate(m.slug)}
              disabled={detail.isPending}
              className="rounded-xl bg-surface p-4 text-left shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-medium tracking-tight">{m.name}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {m.description || `${m.tokenCount} tokens neste cluster`}
                  </p>
                </div>
                <Layers className="size-4 shrink-0 text-subtle" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-subtle">Mcap</dt>
                  <dd className="font-mono tabular-nums">{formatUsd(m.marketCap)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">24h</dt>
                  <dd
                    className={cn(
                      "font-mono tabular-nums",
                      chg != null && chg >= 0 ? "text-good" : "text-bad",
                    )}
                  >
                    {chg != null ? formatPct(chg) : "—"}
                  </dd>
                </div>
              </dl>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 font-mono text-lg tabular-nums">{value}</p>
    </div>
  );
}
