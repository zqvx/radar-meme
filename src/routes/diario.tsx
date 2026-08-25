import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Scissors, Target, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getPrices, getUsdEur, xrayToken } from "@/lib/dex-api";
import { formatEur, formatUsd } from "@/lib/format";
import { useBets, useExitRules, useUsdEur } from "@/lib/storage";
import type { Bet } from "@/lib/types";
import { cn, isValidAddress, shortAddress } from "@/lib/utils";

type Search = { ca?: string; chain?: string; name?: string };

export const Route = createFileRoute("/diario")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ca: typeof s.ca === "string" ? s.ca : undefined,
    chain: typeof s.chain === "string" ? s.chain : undefined,
    name: typeof s.name === "string" ? s.name : undefined,
  }),
  component: DiarioPage,
});

function DiarioPage() {
  const search = Route.useSearch();
  const [bets, setBets] = useBets();
  const [usdEur, setUsdEur] = useUsdEur();
  const [exitRules, setExitRules] = useExitRules();
  const [name, setName] = useState(search.name ?? "");
  const [address, setAddress] = useState(search.ca ?? "");
  const [chainId, setChainId] = useState(search.chain ?? "");
  const [stake, setStake] = useState("1");
  const [entry, setEntry] = useState("");
  const [notes, setNotes] = useState("");

  useQuery({
    queryKey: ["usd-eur"],
    queryFn: async () => {
      const res = await getUsdEur();
      if (res.ok) setUsdEur(res.usdEur);
      return res;
    },
    staleTime: 3_600_000,
  });

  const openWithCa = bets.filter((b) => !b.closedAt && b.address);
  const pricesQ = useQuery({
    queryKey: ["bet-prices", openWithCa.map((b) => b.address).join(",")],
    queryFn: () =>
      getPrices({
        data: {
          items: openWithCa.map((b) => ({
            address: b.address!,
            chainId: b.chainId,
          })),
        },
      }),
    enabled: openWithCa.length > 0,
    staleTime: 30_000,
  });

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    if (pricesQ.data?.ok) {
      for (const p of pricesQ.data.prices) {
        m.set(p.address.toLowerCase(), p.priceUsd);
      }
    }
    return m;
  }, [pricesQ.data]);

  const quote = useMutation({
    mutationFn: () =>
      xrayToken({
        data: { address: address.trim(), chainId: chainId || undefined },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        setEntry(String(res.token.priceUsd));
        if (!name) setName(res.token.symbol);
        setChainId(res.token.chainId);
      }
    },
  });

  function add(e: React.FormEvent) {
    e.preventDefault();
    const stakeEur = Number(stake) || 1;
    const entryPriceUsd = Number(entry);
    if (!name.trim() || !(entryPriceUsd > 0)) return;
    const bet: Bet = {
      id: crypto.randomUUID(),
      name: name.trim(),
      address: address.trim() || undefined,
      chainId: chainId || undefined,
      stakeEur,
      entryPriceUsd,
      entryAt: new Date().toISOString(),
      notes: notes.trim(),
    };
    setBets((prev) => [bet, ...prev]);
    setName("");
    setAddress("");
    setChainId("");
    setEntry("");
    setNotes("");
    setStake("1");
  }

  function closeBet(id: string) {
    const bet = bets.find((b) => b.id === id);
    if (!bet) return;
    const live = bet.address
      ? priceMap.get(bet.address.toLowerCase())
      : undefined;
    const exit = live && live > 0 ? live : bet.entryPriceUsd;
    setBets((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, closedAt: new Date().toISOString(), exitPriceUsd: exit }
          : b,
      ),
    );
  }

  function remove(id: string) {
    setBets((prev) => prev.filter((b) => b.id !== id));
  }

  const rows = bets.map((b) => {
    const current =
      b.closedAt && b.exitPriceUsd
        ? b.exitPriceUsd
        : b.address
          ? (priceMap.get(b.address.toLowerCase()) ?? b.entryPriceUsd)
          : b.entryPriceUsd;
    const multiple = b.entryPriceUsd > 0 ? current / b.entryPriceUsd : 1;
    const pnl = (multiple - 1) * b.stakeEur;
    const gainPct = (multiple - 1) * 100;
    const signal: "target" | "stop" | null = b.closedAt
      ? null
      : gainPct >= exitRules.takeProfitPct
        ? "target"
        : gainPct <= -exitRules.stopLossPct
          ? "stop"
          : null;
    return { bet: b, current, multiple, pnl, signal };
  });

  const openPnl = rows.filter((r) => !r.bet.closedAt).reduce((s, r) => s + r.pnl, 0);
  const closedPnl = rows
    .filter((r) => r.bet.closedAt)
    .reduce((s, r) => s + r.pnl, 0);
  const deployed = rows
    .filter((r) => !r.bet.closedAt)
    .reduce((s, r) => s + r.bet.stakeEur, 0);

  const chart = useMemo(() => {
    const closed = rows
      .filter((r) => r.bet.closedAt)
      .slice()
      .reverse();
    let acc = 0;
    return closed.map((r) => {
      acc += r.pnl;
      return {
        t: new Date(r.bet.closedAt!).toLocaleDateString("pt-PT"),
        pnl: Number(acc.toFixed(2)),
      };
    });
  }, [rows]);

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-subtle uppercase">
        Diário
      </p>
      <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">
        Apostas de 1€, P&L em euros.
      </h1>
      <p className="mt-2 max-w-xl text-muted">
        O tamanho força disciplina. Câmbio USD/EUR {usdEur.toFixed(3)} — o P&L
        é sobre a tua stake em euros, não sobre o dólar.
      </p>

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <Kpi label="Em jogo" value={formatEur(deployed)} />
        <Kpi
          label="P&L aberto"
          value={formatEur(openPnl)}
          tone={openPnl >= 0 ? "text-good" : "text-bad"}
        />
        <Kpi
          label="P&L fechado"
          value={formatEur(closedPnl)}
          tone={closedPnl >= 0 ? "text-good" : "text-bad"}
        />
      </section>

      <section className="mt-6 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="text-sm text-fg">A tua regra de saída</p>
        <p className="mt-1 text-xs text-muted">
          Isto não prevê nada — só te avisa quando uma posição aberta bate os
          números que TU escolheres. Decidir continua a ser contigo.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs text-subtle">
            Vender com lucro de +%
            <Input
              className="mt-1"
              type="number"
              min="1"
              step="1"
              value={exitRules.takeProfitPct}
              onChange={(e) =>
                setExitRules((r) => ({
                  ...r,
                  takeProfitPct: Number(e.target.value) || 1,
                }))
              }
            />
          </label>
          <label className="block text-xs text-subtle">
            Cortar com perda de -%
            <Input
              className="mt-1"
              type="number"
              min="1"
              step="1"
              value={exitRules.stopLossPct}
              onChange={(e) =>
                setExitRules((r) => ({
                  ...r,
                  stopLossPct: Number(e.target.value) || 1,
                }))
              }
            />
          </label>
        </div>
      </section>

      {chart.length >= 2 ? (
        <div className="mt-6 h-48 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <CartesianGrid stroke="rgba(236,234,228,0.08)" />
              <XAxis dataKey="t" tick={{ fill: "#8d9088", fontSize: 11 }} />
              <YAxis tick={{ fill: "#8d9088", fontSize: 11 }} width={48} />
              <Tooltip
                contentStyle={{
                  background: "#181b22",
                  border: "1px solid rgba(236,234,228,0.12)",
                  borderRadius: 8,
                }}
              />
              <Line
                type="monotone"
                dataKey="pnl"
                stroke="#c5cdc0"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul className="space-y-3">
          {rows.map(({ bet, current, multiple, pnl, signal }) => (
            <li
              key={bet.id}
              className={cn(
                "rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]",
                signal === "target" && "ring-1 ring-good/50",
                signal === "stop" && "ring-1 ring-bad/50",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium tracking-tight">{bet.name}</h3>
                  <p className="font-mono text-xs text-subtle">
                    {bet.address ? shortAddress(bet.address) : "sem contrato"} ·{" "}
                    {new Date(bet.entryAt).toLocaleDateString("pt-PT")}
                  </p>
                </div>
                <p
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    pnl >= 0 ? "text-good" : "text-bad",
                  )}
                >
                  {pnl >= 0 ? "+" : ""}
                  {formatEur(pnl)}
                </p>
              </div>
              {signal === "target" ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-good">
                  <Target className="size-3.5" />
                  Bateste o teu alvo de +{exitRules.takeProfitPct}%. Tu
                  decidiste isto, não o app.
                </p>
              ) : null}
              {signal === "stop" ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-bad">
                  <Scissors className="size-3.5" />
                  Bateste o teu corte de -{exitRules.stopLossPct}%. Tu
                  decidiste isto, não o app.
                </p>
              ) : null}
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-subtle">Stake</dt>
                  <dd className="tabular-nums">{formatEur(bet.stakeEur)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Entrada</dt>
                  <dd className="font-mono tabular-nums">
                    {formatUsd(bet.entryPriceUsd, false)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Agora</dt>
                  <dd className="font-mono tabular-nums">
                    {formatUsd(current, false)} · {multiple.toFixed(2)}×
                  </dd>
                </div>
              </dl>
              {bet.notes ? (
                <p className="mt-2 text-sm text-muted">{bet.notes}</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                {!bet.closedAt ? (
                  <Button variant="secondary" size="sm" onClick={() => closeBet(bet.id)}>
                    Fechar
                  </Button>
                ) : (
                  <span className="text-xs text-subtle">Fechada</span>
                )}
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Apagar"
                  onClick={() => remove(bet.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="rounded-xl bg-surface px-4 py-10 text-center text-sm text-muted shadow-[var(--shadow-border)]">
              Ainda sem apostas. Um euro chega para aprender o processo.
            </li>
          ) : null}
        </ul>

        <form
          onSubmit={add}
          className="h-fit rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] lg:sticky lg:top-8"
        >
          <h2 className="flex items-center gap-2 font-medium">
            <Plus className="size-4" />
            Nova aposta
          </h2>
          <label className="mt-4 block text-xs text-subtle">
            Nome / ticker
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="mt-3 block text-xs text-subtle">
            Contrato (opcional)
            <div className="mt-1 flex gap-2">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="font-mono"
                placeholder="para preço automático"
              />
              <Button
                variant="secondary"
                disabled={!isValidAddress(address.trim()) || quote.isPending}
                onClick={() => quote.mutate()}
                type="button"
              >
                {quote.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Preço"
                )}
              </Button>
            </div>
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block text-xs text-subtle">
              Stake €
              <Input
                className="mt-1"
                type="number"
                min="0.5"
                step="0.5"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
            </label>
            <label className="block text-xs text-subtle">
              Preço entrada USD
              <Input
                className="mt-1"
                type="number"
                step="any"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="mt-3 block text-xs text-subtle">
            Tese
            <Textarea
              className="mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Porque é que isto merece 1€"
            />
          </label>
          {Number(stake) > 0 ? (
            <div className="mt-3 rounded-lg bg-elevated p-3">
              <p className="text-xs text-subtle">
                Se isto multiplicar (aritmética, não previsão):
              </p>
              <dl className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                {[2, 5, 10, 20].map((m) => (
                  <div key={m}>
                    <dt className="font-mono text-subtle">{m}×</dt>
                    <dd className="font-mono tabular-nums text-good">
                      +{formatEur((m - 1) * Number(stake))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          <Button type="submit" className="mt-4 w-full">
            Registar
          </Button>
        </form>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
      <p className="text-xs text-subtle">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl tabular-nums tracking-tight", tone)}>
        {value}
      </p>
    </div>
  );
}
