import { useCallback, useEffect, useRef, useState } from "react";
import { CURATED_CATALYSES } from "./catalyses-seed";
import type { Bet, Catalysis, ManualChecks } from "./types";
import { freshWallet, type WalletState } from "./wallet";

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

// Evento de sync na mesma aba (o "storage" nativo só dispara noutras abas).
const SYNC_EVENT = "radar-storage-sync";

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
    // Sync na mesma aba: vários componentes (Radar + Carteira + Pick) podem
    // usar a mesma chave em simultâneo; o evento avisa as outras instâncias.
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: key }));
  }, [value, key, hydrated]);

  // Sync entre abas E entre instâncias da mesma aba: adota escrita externa
  // só se o conteúdo for diferente — o guarda do JSON é o que quebra o
  // ping-pong (A escreve → B adota → B escreve o mesmo → A vê igual → para).
  useEffect(() => {
    const onExternal = (e: StorageEvent | Event) => {
      if (e instanceof StorageEvent) {
        if (e.key !== null && e.key !== key) return;
      } else if (e instanceof CustomEvent) {
        if (e.type !== SYNC_EVENT || e.detail !== key) return;
      } else {
        return;
      }
      const fresh = readJson(key, initial);
      if (JSON.stringify(fresh) !== JSON.stringify(valueRef.current)) {
        setValue(fresh);
      }
    };
    window.addEventListener("storage", onExternal);
    window.addEventListener(SYNC_EVENT, onExternal);
    return () => {
      window.removeEventListener("storage", onExternal);
      window.removeEventListener(SYNC_EVENT, onExternal);
    };
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

/** Carteira de paper trading (dinheiro fictício). */
export function useWallet() {
  return useLocalState<WalletState>("radar.wallet", freshWallet());
}

/** Leitura fresca do disco — usa-se ANTES de mutar a carteira, para nunca
 * trabalhar sobre uma cópia em memória desatualizada (múltiplas instâncias
 * na mesma aba). */
export function readWallet(): WalletState {
  return readJson<WalletState>("radar.wallet", freshWallet());
}
