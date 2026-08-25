import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink, ScanSearch, ShoppingCart, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BuyPanel } from "@/components/buy-panel";
import { ScoreRing } from "@/components/score-ring";
import { Button } from "@/components/ui/button";
import {
  chainLabel,
  formatAge,
  formatPct,
  formatUsd,
  tokenKey,
} from "@/lib/format";
import type { ScoredToken } from "@/lib/types";
import { cn, shortAddress } from "@/lib/utils";

function TokenAvatar({ token }: { token: ScoredToken }) {
  const letter = (token.symbol || "?").slice(0, 1).toUpperCase();
  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-elevated shadow-[var(--shadow-border)]">
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm text-muted">
        {letter}
      </span>
      {token.imageUrl ? (
        <img
          src={token.imageUrl}
          alt=""
          className="relative z-10 size-full object-cover outline outline-1 -outline-offset-1 outline-fg/10"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}

export function TokenCard({
  token,
  watched,
  onToggleWatch,
}: {
  token: ScoredToken;
  watched?: boolean;
  onToggleWatch?: (key: string) => void;
}) {
  const [buyOpen, setBuyOpen] = useState(false);
  const key = tokenKey(token.chainId, token.tokenAddress);
  const hardFlags = token.score.flags.filter((f) => f.severity === "bad");
  const tone =
    token.score.verdict === "go"
      ? "text-good"
      : token.score.verdict === "caution"
        ? "text-warn"
        : "text-bad";

  return (
    <article className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]">
      <div className="flex items-start gap-3">
        <TokenAvatar token={token} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-medium tracking-tight">{token.symbol}</h3>
                <span className="rounded-full bg-elevated px-2 py-0.5 font-mono text-xs text-muted">
                  {chainLabel(token.chainId)}
                </span>
                {token.narrative ? (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                    {token.narrative}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-sm text-muted">{token.name}</p>
            </div>
            <ScoreRing value={token.score.auto} max={80} size={52} />
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
        <Stat label="Mcap" value={formatUsd(token.marketCap)} />
        <Stat label="LP" value={formatUsd(token.liquidityUsd)} />
        <Stat label="Vol 24h" value={formatUsd(token.volumeH24)} />
        <Stat
          label="24h"
          value={formatPct(token.priceChangeH24)}
          tone={token.priceChangeH24 >= 0 ? "text-good" : "text-bad"}
        />
        <Stat label="Idade" value={formatAge(token.pairCreatedAt)} />
        <Stat label="Preço" value={formatUsd(token.priceUsd, false)} />
        <Stat
          label="Veredicto"
          value={token.score.verdictLabel}
          tone={tone}
        />
        <Stat label="CA" value={shortAddress(token.tokenAddress)} mono />
      </dl>

      {hardFlags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {hardFlags.map((f) => (
            <li
              key={f.code}
              className="rounded-full bg-bad/15 px-2 py-0.5 text-xs text-bad"
            >
              {f.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/xray"
          search={{ q: token.tokenAddress, chain: token.chainId }}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 active:scale-[0.96]"
        >
          <ScanSearch className="size-4" />
          X-Ray
        </Link>
        <Button
          variant={buyOpen ? "secondary" : "primary"}
          size="md"
          onClick={() => setBuyOpen((v) => !v)}
          aria-expanded={buyOpen}
        >
          <ShoppingCart className="size-4" />
          {buyOpen ? "Fechar" : "Comprar"}
        </Button>
        {onToggleWatch ? (
          <Button
            variant="secondary"
            size="md"
            onClick={() => onToggleWatch(key)}
            aria-pressed={watched}
          >
            <Star className={cn("size-4", watched && "fill-accent text-accent")} />
            {watched ? "Na lista" : "Seguir"}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Copiar contrato"
          onClick={async () => {
            await navigator.clipboard.writeText(token.tokenAddress);
            toast.success("Contrato copiado");
          }}
        >
          <Copy className="size-4" />
        </Button>
        <a
          href={token.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex size-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-fg"
          aria-label="Abrir na DexScreener"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      {buyOpen ? (
        <div className="mt-3 border-t border-fg/10 pt-3">
          <BuyPanel
            compact
            token={{
              chainId: token.chainId,
              address: token.tokenAddress,
              symbol: token.symbol,
              name: token.name,
              hintPriceUsd: token.priceUsd,
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

function Stat({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd
        className={cn(
          "tabular-nums text-fg",
          mono && "font-mono text-xs",
          tone,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
