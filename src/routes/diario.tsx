import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2,
  PiggyBank,
  Plus,
  RotateCcw,
  Scissors,
  ShoppingCart,
  Target,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getPrices, getUsdEur, xrayToken } from "@/lib/dex-api";
import { formatEur, formatPct, formatUsd } from "@/lib/format";
import {
  readWallet,
  useBets,
  useExitRules,
  useUsdEur,
  useWallet,
} from "@/lib/storage";
import {
  buyToWallet,
  depositToWallet,
  freshWallet,
  sellFromWallet,
  walletEquity,
  walletStats,
  withEquitySnapshot,
} from "@/lib/wallet";
import type { WalletPosition, WalletState } from "@/lib/wallet";
import { cn, isValidAddress, shortAddress } from "@/lib/utils";
import { toast } from "sonner";

type Search = { ca?: string; chain?: string; name?: string };

export const Route = createFileRoute("/diario")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ca: typeof s.ca === "string" ? s.ca : undefined,
    chain: typeof s.chain === "string" ? s.chain : undefined,
    name: typeof s.name === "string" ? s.name : undefined,
  }),
  component: CarteiraPage,
});

function CarteiraPage() {
  const search = Route.useSearch();
  const [wallet, setWallet, hydrated] = useWallet();
  const [bets, setBets] = useBets();
  const [usdEur, setUsdEur] = useUsdEur();
  const [exitRules, setExitRules] = useExitRules();
  const [name, setName] = useState(search.name ?? "");
  const [address, setAddress] = useState(search.ca ?? "");
  const [chainId, setChainId] = useState(search.chain ?? "");
  const [amount, setAmount] = useState("1");
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

  // Preço vivo para as posições da carteira + apostas antigas (máx. 20).
  const openBets = bets.filter((b) => !b.closedAt && b.address);
  const priceItems = useMemo(() => {
    const seen = new Set<string>();
    const items: { address: string; chainId?: string }[] = [];
    for (const p of wallet.positions) {
      if (!p.address) continue;
      const k = p.address.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ address: p.address, chainId: p.chainId });
    }
    for (const b of openBets) {
      const k = b.address!.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ address: b.address!, chainId: b.chainId });
    }
    return items.slice(0, 20);
  }, [wallet.positions, openBets]);

  const pricesQ = useQuery({
    queryKey: ["wallet-prices", priceItems.map((i) => i.address).join(",")],
    queryFn: () => getPrices({ data: { items: priceItems } }),
    enabled: priceItems.length > 0,
    staleTime: 2_000,
    // 2.5s: a DexScreener não tem WebSocket público de preços — o site deles
    // também vive de polling. 1 req = até 20 tokens → ~24 req/min, 8% do
    // limite de 300/min. É o mais "tempo real" que a fonte oficial permite.
    refetchInterval: 2_500,
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

  // Mapa tokenKey -> preço vivo, para a matemática da carteira.
  const liveByToken = useMemo(() => {
    const m = new Map<string, number>();
    for (const pos of wallet.positions) {
      const price = pos.address
        ? priceMap.get(pos.address.toLowerCase())
        : undefined;
      if (price && price > 0) m.set(pos.tokenKey, price);
    }
    return m;
  }, [wallet.positions, priceMap]);

  const stats = useMemo(
    () => walletStats(wallet, liveByToken, usdEur),
    [wallet, liveByToken, usdEur],
  );

  // Snapshot de equity a cada 10s (e ao montar) para a curva da carteira.
  useEffect(() => {
    if (!hydrated) return;
    const tick = () => {
      const fresh = readWallet();
      const eq = walletEquity(fresh, liveByToken, usdEur);
      const next = withEquitySnapshot(fresh, eq);
      if (next !== fresh) setWallet(next);
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [hydrated, liveByToken, usdEur, setWallet]);

  // Relógio de 1s para "há Xs" — só corre com itens a renovar.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (priceItems.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [priceItems.length]);
  const ageSec =
    pricesQ.dataUpdatedAt > 0
      ? Math.max(0, Math.floor((now - pricesQ.dataUpdatedAt) / 1000))
      : null;

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

  // ----- Operações (sempre a partir do disco, nunca de cópia velha) -----

  function snapshot(state: WalletState): void {
    const eq = walletEquity(state, liveByToken, usdEur);
    setWallet(withEquitySnapshot(state, eq));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const costEur = Number(amount);
    if (!name.trim()) {
      toast.error("Manda o nome/ticker da moeda.");
      return;
    }
    const addr = address.trim();
    let priceUsd: number;
    if (addr && isValidAddress(addr)) {
      priceUsd = priceMap.get(addr.toLowerCase()) ?? NaN;
      if (!(priceUsd > 0)) {
        toast.error("Sem preço vivo para este contrato — tenta o botão Preço.");
        return;
      }
    } else {
      priceUsd = Number(entry);
      if (!(priceUsd > 0)) {
        toast.error("Sem contrato, tens de mandar o preço de entrada.");
        return;
      }
    }
    const result = buyToWallet(readWallet(), {
      chainId: chainId || "manual",
      address: addr && isValidAddress(addr) ? addr : undefined,
      symbol: name.trim(),
      name: name.trim(),
      priceUsd,
      costEur,
      usdEur,
      tpPct: exitRules.takeProfitPct,
      slPct: exitRules.stopLossPct,
      note: notes.trim() || undefined,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    snapshot(result.state);
    toast.success(
      `Compraste ${name.trim()} por ${formatEur(costEur)} a ${formatUsd(priceUsd, false)} (fictício).`,
    );
    setName("");
    setAddress("");
    setChainId("");
    setEntry("");
    setNotes("");
    setAmount("1");
  }

  function sell(pos: WalletPosition, fraction: number) {
    const price = pos.address
      ? priceMap.get(pos.address.toLowerCase())
      : undefined;
    if (!price || !(price > 0)) {
      toast.error("Sem preço vivo para vender — espera o próximo ciclo.");
      return;
    }
    const result = sellFromWallet(readWallet(), {
      positionId: pos.id,
      priceUsd: price,
      usdEur,
      fraction,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    snapshot(result.state);
    const pnl = result.pnlEur!;
    toast.success(
      `Vendiste ${Math.round(fraction * 100)}% de ${pos.symbol} por ${formatEur(result.proceedsEur!)} · P&L ${
        pnl >= 0 ? "+" : ""
      }${formatEur(pnl)}`,
    );
  }

  function deposit(v: number) {
    const result = depositToWallet(readWallet(), v);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    snapshot(result.state);
    toast.success(`Depositei ${formatEur(v)} fictício na carteira.`);
  }

  function reset() {
    if (
      !window.confirm(
        "Repor a carteira a 100€? Todo o histórico de treino some.",
      )
    )
      return;
    setWallet(freshWallet());
  }

  // ----- Apostas antigas de 1€ (mantidas a funcionar) -----

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

  function removeBet(id: string) {
    setBets((prev) => prev.filter((b) => b.id !== id));
  }

  const chart = useMemo(
    () =>
      wallet.equityHistory.map((p) => ({
        t: new Date(p.t).toLocaleTimeString("pt-PT", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        equity: p.equity,
      })),
    [wallet.equityHistory],
  );

  return (
    <div>
      <p className="font-mono text-xs tracking-widest text-subtle uppercase">
        Carteira
      </p>
      <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">
        Dinheiro fictício, disciplina real.
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Carteira de treino com {formatEur(wallet.cash)} em caixa: entra a
        preço vivo, vende 50% ou tudo, e vê a curva de equity andar. Tudo
        fictício — o objetivo é treinar o processo (e não o saldo).
      </p>
      {priceItems.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-good" />
          </span>
          Preços em direto — renovam sozinhos a cada 2,5s
          {ageSec != null ? (
            <span className={ageSec > 45 ? "text-warn" : "text-subtle"}>
              · atualizado há {ageSec}s
            </span>
          ) : (
            <span className="text-subtle">· a carregar…</span>
          )}
          {pricesQ.isError ? (
            <span className="text-bad">· a fonte falhou, a tentar de novo…</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-xs text-subtle">
          Sem contratos em carteira — nada a renovar em direto.
        </p>
      )}

      {/* KPIs principais */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total da carteira"
          value={formatEur(stats.equity)}
          sub={`${formatPct(stats.totalPnlPct)} sobre ${formatEur(stats.totalDeposited)} investidos`}
          tone={
            stats.totalPnlEur >= 0 ? "text-good" : "text-bad"
          }
        />
        <Kpi
          label="Caixa disponível"
          value={formatEur(stats.cash)}
          sub="para novas compras"
        />
        <Kpi
          label="Em posições"
          value={formatEur(stats.deployed)}
          sub={`${wallet.positions.length} aberta${
            wallet.positions.length === 1 ? "" : "s"
          }`}
        />
        <Kpi
          label="P&L total"
          value={`${stats.totalPnlEur >= 0 ? "+" : ""}${formatEur(stats.totalPnlEur)}`}
          sub={`fechado ${formatEur(stats.realizedEur)} · aberto ${formatEur(stats.unrealizedEur)}`}
          tone={stats.totalPnlEur >= 0 ? "text-good" : "text-bad"}
        />
      </section>

      {/* Stats de treino */}
      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat
          label="Win rate"
          value={
            stats.winRate == null
              ? "—"
              : `${stats.winRate}% (${stats.winCount}/${stats.closedCount})`
          }
        />
        <MiniStat
          label="Max drawdown"
          value={`${stats.maxDrawdownPct.toFixed(1)}%`}
          tone={stats.maxDrawdownPct > 20 ? "text-warn" : undefined}
        />
        <MiniStat
          label="Melhor trade"
          value={
            stats.best
              ? `+${formatEur(stats.best.pnlEur)} · ${stats.best.symbol}`
              : "—"
          }
          tone={stats.best ? "text-good" : undefined}
        />
        <MiniStat
          label="Pior trade"
          value={
            stats.worst
              ? `${formatEur(stats.worst.pnlEur)} · ${stats.worst.symbol}`
              : "—"
          }
          tone={stats.worst ? "text-bad" : undefined}
        />
      </section>

      {/* Controlo do dinheiro fictício */}
      <section className="mt-6 flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
        <PiggyBank className="size-4 text-muted" />
        <span className="mr-1 text-sm text-muted">Dinheiro de treino:</span>
        <Button variant="secondary" size="sm" onClick={() => deposit(50)}>
          <Plus className="size-4" /> +€50
        </Button>
        <Button variant="secondary" size="sm" onClick={() => deposit(100)}>
          <Plus className="size-4" /> +€100
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">
          <RotateCcw className="size-4" /> Repor a 100€
        </Button>
      </section>

      {/* Curva de equity */}
      <div className="mt-6 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm text-fg">Curva de equity</p>
          <p className="text-xs text-subtle">
            snapshot a cada 10s + a cada operação · preços a cada 2,5s
          </p>
        </div>
        {chart.length >= 2 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid stroke="rgba(236,234,228,0.08)" />
                <XAxis dataKey="t" tick={{ fill: "#8d9088", fontSize: 11 }} />
                <YAxis
                  tick={{ fill: "#8d9088", fontSize: 11 }}
                  width={52}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    background: "#181b22",
                    border: "1px solid rgba(236,234,228,0.12)",
                    borderRadius: 8,
                  }}
                />
                <ReferenceLine
                  y={stats.totalDeposited}
                  stroke="rgba(236,234,228,0.25)"
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke="#c5cdc0"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="px-1 py-10 text-center text-sm text-muted">
            A curva começa a desenhar-se enquanto a página estiver aberta —
            e salta a cada compra/venda.
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          {/* Posições abertas */}
          <section>
            <h2 className="mb-3 font-medium">Posições abertas</h2>
            <ul className="space-y-3">
              {wallet.positions.map((pos) => {
                const live = pos.address
                  ? priceMap.get(pos.address.toLowerCase())
                  : undefined;
                const value = live
                  ? (pos.shares * live) / usdEur
                  : null;
                const pnl = value != null ? value - pos.costEur : null;
                const multiple =
                  value != null && pos.costEur > 0
                    ? value / pos.costEur
                    : null;
                const gainPct =
                  live && pos.entryPriceUsd > 0
                    ? (live / pos.entryPriceUsd - 1) * 100
                    : null;
                const signal: "target" | "stop" | null =
                  gainPct == null
                    ? null
                    : gainPct >= pos.tpPct
                      ? "target"
                      : gainPct <= -pos.slPct
                        ? "stop"
                        : null;
                return (
                  <li
                    key={pos.id}
                    className={cn(
                      "rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]",
                      signal === "target" && "ring-1 ring-good/50",
                      signal === "stop" && "ring-1 ring-bad/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-medium tracking-tight">
                          {pos.symbol}
                        </h3>
                        <p className="font-mono text-xs text-subtle">
                          {pos.address ? shortAddress(pos.address) : "sem contrato"} ·{" "}
                          {new Date(pos.openedAt).toLocaleDateString("pt-PT")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={cn(
                            "font-mono text-sm tabular-nums",
                            pnl == null
                              ? "text-subtle"
                              : pnl >= 0
                                ? "text-good"
                                : "text-bad",
                          )}
                        >
                          {pnl == null
                            ? "—"
                            : `${pnl >= 0 ? "+" : ""}${formatEur(pnl)}`}
                        </p>
                        {gainPct != null ? (
                          <p
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              gainPct >= 0 ? "text-good" : "text-bad",
                            )}
                          >
                            {formatPct(gainPct)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {signal === "target" ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-good">
                        <Target className="size-3.5" />
                        Bateste o teu alvo de +{pos.tpPct}%. Tu decides se
                        vendes — o app só avisa.
                      </p>
                    ) : null}
                    {signal === "stop" ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-bad">
                        <Scissors className="size-3.5" />
                        Bateste o teu corte de -{pos.slPct}%. O plano dizia
                        cortar.
                      </p>
                    ) : null}
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-subtle">Custo</dt>
                        <dd className="tabular-nums">
                          {formatEur(pos.costEur)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-subtle">Entrada</dt>
                        <dd className="font-mono tabular-nums">
                          {formatUsd(pos.entryPriceUsd, false)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-subtle">Agora</dt>
                        <dd className="font-mono tabular-nums">
                          {live && live > 0 ? (
                            <>
                              {formatUsd(live, false)} ·{" "}
                              {multiple!.toFixed(2)}×
                            </>
                          ) : (
                            <span className="text-warn">sem preço</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-subtle">Valor</dt>
                        <dd className="tabular-nums">
                          {value != null ? formatEur(value) : "—"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!live || !(live > 0)}
                        onClick={() => sell(pos, 0.5)}
                        title={
                          live && live > 0
                            ? "Vender metade (lock some lucro)"
                            : "Sem preço vivo"
                        }
                      >
                        Vender 50%
                      </Button>
                      <Button
                        size="sm"
                        disabled={!live || !(live > 0)}
                        onClick={() => sell(pos, 1)}
                        title={
                          live && live > 0 ? "Fechar tudo" : "Sem preço vivo"
                        }
                      >
                        Vender tudo
                      </Button>
                    </div>
                  </li>
                );
              })}
              {wallet.positions.length === 0 ? (
                <li className="rounded-xl bg-surface px-4 py-10 text-center text-sm text-muted shadow-[var(--shadow-border)]">
                  Sem posições abertas. Compra no Radar (botão Comprar), no
                  X-Ray, no Pick — ou no formulário ao lado.
                </li>
              ) : null}
            </ul>
          </section>

          {/* Histórico */}
          <section>
            <h2 className="mb-3 font-medium">Histórico de operações</h2>
            <ul className="divide-y divide-fg/5 rounded-xl bg-surface shadow-[var(--shadow-border)]">
              {wallet.txs
                .slice(-40)
                .reverse()
                .map((tx) => (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {tx.kind === "deposit" ? (
                        <PiggyBank className="size-4 shrink-0 text-subtle" />
                      ) : tx.kind === "buy" ? (
                        <ShoppingCart className="size-4 shrink-0 text-subtle" />
                      ) : (
                        <Scissors className="size-4 shrink-0 text-subtle" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate">
                          {tx.kind === "deposit"
                            ? "Depósito de treino"
                            : `${tx.kind === "buy" ? "Compra" : "Venda"} ${tx.symbol ?? ""}`}
                          {tx.note ? (
                            <span className="text-xs text-subtle">
                              {" "}
                              · {tx.note}
                            </span>
                          ) : null}
                        </p>
                        <p className="font-mono text-xs text-subtle">
                          {new Date(tx.t).toLocaleString("pt-PT", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {tx.priceUsd
                            ? ` · a ${formatUsd(tx.priceUsd, false)}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <p
                      className={cn(
                        "font-mono text-sm tabular-nums",
                        tx.kind === "buy"
                          ? "text-fg"
                          : tx.eur >= 0
                            ? "text-good"
                            : "text-bad",
                      )}
                    >
                      {tx.kind === "buy"
                        ? `−${formatEur(Math.abs(tx.eur))}`
                        : `${tx.eur >= 0 ? "+" : ""}${formatEur(tx.eur)}`}
                    </p>
                  </li>
                ))}
            </ul>
          </section>

          {/* Apostas antigas */}
          {bets.length > 0 ? (
            <details className="rounded-xl bg-surface shadow-[var(--shadow-border)]">
              <summary className="cursor-pointer px-4 py-3 text-sm text-muted">
                Apostas antigas de 1€ ({bets.length}) — sistema anterior,
                mantido
              </summary>
              <ul className="space-y-3 p-4 pt-0">
                {bets.map((b) => {
                  const live = b.address
                    ? priceMap.get(b.address.toLowerCase())
                    : undefined;
                  const current =
                    b.closedAt && b.exitPriceUsd
                      ? b.exitPriceUsd
                      : b.address
                        ? live ?? null
                        : null;
                  const pnl =
                    current != null && b.entryPriceUsd > 0
                      ? (current / b.entryPriceUsd - 1) * b.stakeEur
                      : null;
                  return (
                    <li
                      key={b.id}
                      className="rounded-lg bg-elevated p-3"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{b.name}</span>
                        <span
                          className={cn(
                            "font-mono tabular-nums",
                            pnl == null
                              ? "text-subtle"
                              : pnl >= 0
                                ? "text-good"
                                : "text-bad",
                          )}
                        >
                          {pnl == null
                            ? "—"
                            : `${pnl >= 0 ? "+" : ""}${formatEur(pnl)}`}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-subtle">
                        {formatEur(b.stakeEur)} · entrada{" "}
                        {formatUsd(b.entryPriceUsd, false)}
                        {current != null ? ` · agora ${formatUsd(current, false)}` : ""}
                      </p>
                      <div className="mt-2 flex gap-2">
                        {!b.closedAt ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => closeBet(b.id)}
                          >
                            Fechar
                          </Button>
                        ) : (
                          <span className="text-xs text-subtle">Fechada</span>
                        )}
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label="Apagar"
                          onClick={() => removeBet(b.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
        </div>

        {/* Coluna direita: compra + regras de saída */}
        <div className="space-y-6">
          <form
            onSubmit={submit}
            className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] lg:sticky lg:top-8"
          >
            <h2 className="flex items-center gap-2 font-medium">
              <ShoppingCart className="size-4" />
              Comprar na carteira
            </h2>
            <p className="mt-1 text-xs text-subtle">
              Caixa: {formatEur(wallet.cash)} · regras de saída capturadas no
              momento da compra
            </p>
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
              Contrato (recomendado — dá preço vivo)
              <div className="mt-1 flex gap-2">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="font-mono"
                  placeholder="sem contrato = sem preço vivo"
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
                Montante €
                <div className="mt-1 flex gap-1">
                  <Input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full"
                  />
                  <button
                    type="button"
                    className="h-10 shrink-0 rounded-md bg-elevated px-2 font-mono text-xs text-muted shadow-[var(--shadow-border)] hover:text-fg"
                    onClick={() =>
                      setAmount(
                        String(Math.floor(wallet.cash * 100) / 100),
                      )
                    }
                  >
                    Max
                  </button>
                </div>
              </label>
              <label className="block text-xs text-subtle">
                Preço entrada USD
                <Input
                  className="mt-1"
                  type="number"
                  step="any"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                />
              </label>
            </div>
            <label className="mt-3 block text-xs text-subtle">
              Tese (opcional)
              <Textarea
                className="mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Porque é que isto merece o dinheiro fictício"
              />
            </label>
            {Number(amount) > 0 ? (
              <div className="mt-3 rounded-lg bg-elevated p-3">
                <p className="text-xs text-subtle">
                  Se o montante multiplicar (aritmética, não previsão):
                </p>
                <dl className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                  {[2, 5, 10, 20].map((m) => (
                    <div key={m}>
                      <dt className="font-mono text-subtle">{m}×</dt>
                      <dd className="font-mono tabular-nums text-good">
                        +{formatEur((m - 1) * Number(amount))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            <Button type="submit" className="mt-4 w-full">
              Comprar
            </Button>
          </form>

          <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
            <p className="text-sm text-fg">Regra de saída (novo)</p>
            <p className="mt-1 text-xs text-muted">
              Aplicada às compras feitas a partir de agora; as posições
              abertas mantêm a regra com que foram abertas.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs text-subtle">
                Alvo de lucro +%
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
                Corte de perda -%
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

          <p className="px-1 text-xs text-subtle">
            Dinheiro fictício, sem risco real — mas o processo é o mesmo de
            sempre e 7 em cada 10 destas moedas perdem 70–100%. Não é
            aconselhamento financeiro.
          </p>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
      <p className="text-xs text-subtle">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-2xl tabular-nums tracking-tight",
          tone,
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-subtle">{sub}</p> : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <p className="text-xs text-subtle">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate font-mono text-sm tabular-nums",
          tone,
        )}
      >
        {value}
      </p>
    </div>
  );
}
