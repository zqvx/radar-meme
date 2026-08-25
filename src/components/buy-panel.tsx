import { useMutation } from "@tanstack/react-query";
import { Loader2, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPrices } from "@/lib/dex-api";
import { formatEur, formatUsd } from "@/lib/format";
import {
  readWallet,
  useExitRules,
  useUsdEur,
  useWallet,
} from "@/lib/storage";
import { buyToWallet } from "@/lib/wallet";

export type BuyToken = {
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  hintPriceUsd?: number;
};

const CHIPS = [1, 5, 10];

/** Painel de compra partilhado (Radar, X-Ray): cota o preço a vivo e
 * compra na carteira fictícia. Sempre a ler o disco antes de mutar. */
export function BuyPanel({
  token,
  compact = false,
}: {
  token: BuyToken;
  compact?: boolean;
}) {
  const [wallet, setWallet] = useWallet();
  const [usdEur] = useUsdEur();
  const [exitRules] = useExitRules();
  const [amount, setAmount] = useState("1");

  const buy = useMutation({
    mutationFn: () =>
      getPrices({
        data: { items: [{ address: token.address, chainId: token.chainId }] },
      }),
    onSuccess: (res) => {
      const price = res.ok
        ? res.prices.find(
            (p) => p.address.toLowerCase() === token.address.toLowerCase(),
          )?.priceUsd
        : undefined;
      if (!res.ok || !price || !(price > 0)) {
        toast.error("Sem preço vivo para este token — tenta de novo.");
        return;
      }
      const costEur = Number(amount);
      const result = buyToWallet(readWallet(), {
        chainId: token.chainId,
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        priceUsd: price,
        costEur,
        usdEur,
        tpPct: exitRules.takeProfitPct,
        slPct: exitRules.stopLossPct,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setWallet(result.state);
      toast.success(
        `Compraste ${token.symbol} por ${formatEur(costEur)} a ${formatUsd(price, false)} (fictício).`,
      );
      setAmount("1");
    },
    onError: () => toast.error("Falha a obter o preço. Tenta de novo."),
  });

  return (
    <div className={compact ? "" : "rounded-lg bg-elevated p-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-fg">
            Comprar {token.symbol} na carteira
          </p>
          <p className="text-xs text-subtle">
            Dinheiro fictício · preço vivo no clique ·{" "}
            {token.hintPriceUsd ? `referência ${formatUsd(token.hintPriceUsd, false)}` : "sem referência"}
          </p>
        </div>
        <p className="font-mono text-xs tabular-nums text-subtle">
          caixa {formatEur(wallet.cash)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {CHIPS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
              className={
                amount === String(v)
                  ? "h-8 rounded-sm bg-accent px-2 font-mono text-xs text-accent-fg"
                  : "h-8 rounded-sm bg-bg px-2 font-mono text-xs text-muted shadow-[var(--shadow-border)] hover:text-fg"
              }
            >
              {v}€
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAmount(String(Math.floor(wallet.cash * 100) / 100))}
            className="h-8 rounded-sm bg-bg px-2 font-mono text-xs text-muted shadow-[var(--shadow-border)] hover:text-fg"
          >
            Max
          </button>
        </div>
        <Input
          className="h-8 w-24 px-2 font-mono text-sm"
          type="number"
          min="0.1"
          step="0.1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Monto em euros"
        />
        <Button
          size="sm"
          onClick={() => buy.mutate()}
          disabled={buy.isPending || !(Number(amount) > 0)}
          className="h-8"
        >
          {buy.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShoppingCart className="size-4" />
          )}
          Comprar
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-subtle">
        Treino: não é dinheiro real e não é aconselhamento financeiro.
      </p>
    </div>
  );
}
