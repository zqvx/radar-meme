import { useCallback, useEffect, useRef, useState } from "react";
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
  const valueRef = useRef(value);
  valueRef.current = value;

  // Hydration: memória parte do que está em disco.
  useEffect(() => {
    setValue(readJson(key, initial));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persistência: memória é a fonte da verdade; o disco é o espelho.
  // A escrita fica FORA do updater (o updater tem de ser puro — se o React
  // o chamar duas vezes, efeitos lá dentro executam duas vezes e o toggle
  // "Seguir"/"Na lista" cancela a si próprio).
  useEffect(() => {
    if (!hydrated) return;
    writeJson(key, value);
  }, [value, key, hydrated]);

  // Sync entre abas: adota escrita externa só se o conteúdo for diferente —
  // o guarda do JSON é o que quebra o ping-pong (A escreve → B adota → B
  // escreve o mesmo → A vê igual → para).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== key) return;
      const fresh = readJson(key, initial);
      if (JSON.stringify(fresh) !== JSON.stringify(valueRef.current)) {
        setValue(fresh);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) =>
        typeof next === "function" ? (next as (p: T) => T)(prev) : next,
      );
    },
    [],
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
