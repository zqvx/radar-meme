import { useCallback, useEffect, useState } from "react";
import { CURATED_CATALYSES } from "./catalyses-seed";
import type { Bet, Catalysis, ManualChecks } from "./types";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const hydrate = () => {
      setValue(readJson(key, initial));
      setHydrated(true);
    };
    hydrate();
    // Sync entre abas: o storage só tem UMA verdade. Se outra aba escrever
    // nesta chave (ex.: fechar uma aposta em /diario enquanto /pick está
    // aberta noutra aba), adota o estado novo em vez de continuar com a
    // memória velha — que antes sobreescrevia o localStorage a seguir.
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) hydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        // Leitura fresca: a escrita assenta no último valor em disco, não na
        // memória desta aba (que outra aba pode já ter ultrapassado).
        const base = readJson(key, prev);
        const resolved = typeof next === "function" ? (next as (p: T) => T)(base) : next;
        writeJson(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, set, hydrated] as const;
}

export function useWatchlist() {
  return useLocalState<string[]>("radar.watchlist", []);
}

export function useUserCatalyses() {
  return useLocalState<Catalysis[]>("radar.catalyses", []);
}

export function mergeCatalyses(user: Catalysis[]): Catalysis[] {
  const ids = new Set(user.map((c) => c.id));
  return [...user, ...CURATED_CATALYSES.filter((c) => !ids.has(c.id))].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
}

export function useBets() {
  return useLocalState<Bet[]>("radar.bets", []);
}

export type ExitRules = { takeProfitPct: number; stopLossPct: number };

export const defaultExitRules: ExitRules = {
  takeProfitPct: 100,
  stopLossPct: 50,
};

/** Regras de saída que TU defines (alvo de lucro / corte de perda em %).
 * O app só avisa quando as bates — nunca decide por ti nem prevê nada. */
export function useExitRules() {
  return useLocalState<ExitRules>("radar.exitRules", defaultExitRules);
}

export function useUsdEur() {
  return useLocalState<number>("radar.usdEur", 0.86);
}

export function useManualMap() {
  return useLocalState<Record<string, ManualChecks>>("radar.manual", {});
}

export const emptyManual: ManualChecks = {
  catalysis: false,
  social: false,
  lpBurned: false,
};
