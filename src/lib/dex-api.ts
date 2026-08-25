import { createServerFn } from "@tanstack/react-start";
import { detectNarrative } from "./narratives";
import { scoreToken } from "./scoring";
import type {
  ManualChecks,
  MetaDetail,
  ScoredToken,
  SocialLink,
  TrendingMeta,
} from "./types";
import { ADDR_RE } from "./utils";

const DEX = "https://api.dexscreener.com";
const SCAN_TTL = 20_000;

type DexPair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  txns?: Record<string, { buys?: number; sells?: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { url?: string }[];
    socials?: { platform?: string; type?: string; handle?: string; url?: string }[];
  };
  boosts?: { active?: number };
};

type BoostItem = {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  amount?: number;
  totalAmount?: number;
  icon?: string;
  description?: string;
  links?: { type?: string; label?: string; url?: string }[];
};

type ScanCache = {
  at: number;
  tokens: ScoredToken[];
};

let scanCache: ScanCache | null = null;

async function dexFetch<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${DEX}${path}`, {
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "user-agent": "RadarMeme/1.0",
      },
    });
    if (!res.ok) throw new Error(`DexScreener ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickBestPair(
  pairs: DexPair[],
  tokenAddress?: string,
  preferredChain?: string,
): DexPair | null {
  let pool = pairs.filter(Boolean);
  if (tokenAddress) {
    const addr = tokenAddress.toLowerCase();
    const matched = pool.filter(
      (p) => p.baseToken?.address?.toLowerCase() === addr,
    );
    if (matched.length) pool = matched;
  }
  if (preferredChain) {
    const onChain = pool.filter((p) => p.chainId === preferredChain);
    if (onChain.length) pool = onChain;
  }
  pool.sort((a, b) => num(b.liquidity?.usd) - num(a.liquidity?.usd));
  return pool[0] ?? null;
}

function socialsOf(pair: DexPair, boost?: BoostItem): SocialLink[] {
  const out: SocialLink[] = [];
  for (const s of pair.info?.socials ?? []) {
    out.push({
      platform: s.platform || s.type || "social",
      handle: s.handle,
      url: s.url,
    });
  }
  for (const l of boost?.links ?? []) {
    if (!l.url) continue;
    if (out.some((x) => x.url === l.url)) continue;
    out.push({
      platform: l.type || l.label || "link",
      url: l.url,
    });
  }
  return out;
}

function websitesOf(pair: DexPair, boost?: BoostItem): string[] {
  const urls = (pair.info?.websites ?? [])
    .map((w) => w.url)
    .filter((u): u is string => Boolean(u));
  for (const l of boost?.links ?? []) {
    if (l.url && (l.type === "website" || l.label === "Website")) {
      if (!urls.includes(l.url)) urls.push(l.url);
    }
  }
  return urls;
}

function imageOf(pair: DexPair, boost?: BoostItem): string | undefined {
  if (pair.info?.imageUrl?.startsWith("http")) return pair.info.imageUrl;
  if (boost?.icon?.startsWith("http")) return boost.icon;
  return undefined;
}

export function pairToToken(
  pair: DexPair,
  extra?: { boost?: BoostItem; description?: string },
): ScoredToken | null {
  const base = pair.baseToken;
  if (!base?.address || !pair.chainId) return null;
  const tx = pair.txns?.h24 ?? {};
  const socials = socialsOf(pair, extra?.boost);
  const name = base.name || base.symbol || "Unknown";
  const symbol = base.symbol || "???";
  const description = extra?.description;
  const input = {
    pairCreatedAt: num(pair.pairCreatedAt),
    marketCap: num(pair.marketCap),
    volumeH24: num(pair.volume?.h24),
    liquidityUsd: num(pair.liquidity?.usd),
    priceChangeH1: num(pair.priceChange?.h1),
    priceChangeH24: num(pair.priceChange?.h24),
    buysH24: num(tx.buys),
    sellsH24: num(tx.sells),
    boostsActive: num(pair.boosts?.active) || num(extra?.boost?.amount),
    hasSocials: socials.length > 0,
  };
  return {
    chainId: pair.chainId,
    tokenAddress: base.address,
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    url: pair.url,
    name,
    symbol,
    imageUrl: imageOf(pair, extra?.boost),
    description,
    websites: websitesOf(pair, extra?.boost),
    socials,
    priceUsd: num(pair.priceUsd),
    marketCap: input.marketCap,
    fdv: num(pair.fdv),
    liquidityUsd: input.liquidityUsd,
    volumeH24: input.volumeH24,
    volumeH1: num(pair.volume?.h1),
    priceChangeH1: input.priceChangeH1,
    priceChangeH24: input.priceChangeH24,
    buysH24: input.buysH24,
    sellsH24: input.sellsH24,
    pairCreatedAt: input.pairCreatedAt,
    boostsActive: input.boostsActive,
    boostAmount: num(extra?.boost?.totalAmount ?? extra?.boost?.amount),
    narrative: detectNarrative(name, symbol, description),
    score: scoreToken(input),
  };
}

async function fetchPairsForAddresses(
  chainId: string,
  addresses: string[],
): Promise<DexPair[]> {
  const out: DexPair[] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const chunk = addresses.slice(i, i + 30);
    try {
      const data = await dexFetch<DexPair[]>(
        `/tokens/v1/${encodeURIComponent(chainId)}/${chunk.join(",")}`,
      );
      if (Array.isArray(data)) out.push(...data);
    } catch {
      // skip failed chunk
    }
  }
  return out;
}

async function runScan(): Promise<ScoredToken[]> {
  const [latest, top, profiles] = await Promise.allSettled([
    dexFetch<BoostItem[]>("/token-boosts/latest/v1"),
    dexFetch<BoostItem[]>("/token-boosts/top/v1"),
    dexFetch<BoostItem[]>("/token-profiles/latest/v1"),
  ]);

  const items: BoostItem[] = [];
  for (const r of [latest, top, profiles]) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) items.push(...r.value);
  }

  const byKey = new Map<string, BoostItem>();
  for (const it of items) {
    if (!it.chainId || !it.tokenAddress) continue;
    const key = `${it.chainId}:${it.tokenAddress.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, it);
      continue;
    }
    const score = (x: BoostItem) => num(x.totalAmount) + num(x.amount);
    if (score(it) > score(prev) || (it.description && !prev.description)) {
      byKey.set(key, { ...prev, ...it });
    }
  }

  const unique = [...byKey.values()]
    .sort(
      (a, b) =>
        num(b.totalAmount ?? b.amount) - num(a.totalAmount ?? a.amount),
    )
    .slice(0, 80);

  const byChain = new Map<string, BoostItem[]>();
  for (const it of unique) {
    const list = byChain.get(it.chainId!) ?? [];
    list.push(it);
    byChain.set(it.chainId!, list);
  }

  const tokens: ScoredToken[] = [];
  await Promise.all(
    [...byChain.entries()].map(async ([chain, list]) => {
      const addrs = list.map((x) => x.tokenAddress!);
      const pairs = await fetchPairsForAddresses(chain, addrs);
      const boostByAddr = new Map(
        list.map((x) => [x.tokenAddress!.toLowerCase(), x]),
      );
      const seen = new Set<string>();
      for (const addr of addrs) {
        const boost = boostByAddr.get(addr.toLowerCase());
        const pair = pickBestPair(pairs, addr, chain);
        if (!pair) continue;
        const key = `${chain}:${addr.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const token = pairToToken(pair, {
          boost,
          description: boost?.description,
        });
        if (token) tokens.push(token);
      }
    }),
  );

  tokens.sort((a, b) => b.score.auto - a.score.auto);
  return tokens;
}

const EVM_CHAINS = [
  "ethereum",
  "base",
  "bsc",
  "arbitrum",
  "polygon",
  "avalanche",
  "optimism",
];
const ALT_CHAINS = ["solana", "sui", "ton"];

async function lookupAddress(
  address: string,
  preferredChain?: string,
): Promise<DexPair | null> {
  const chains = preferredChain
    ? [preferredChain]
    : address.startsWith("0x")
      ? EVM_CHAINS
      : ALT_CHAINS;
  const found: DexPair[] = [];
  await Promise.all(
    chains.map(async (chain) => {
      try {
        const pairs = await fetchPairsForAddresses(chain, [address]);
        const best = pickBestPair(pairs, address, chain);
        if (best) found.push(best);
      } catch {
        // skip chain
      }
    }),
  );
  return pickBestPair(found, address, preferredChain);
}

export const scanRadar = createServerFn({ method: "POST" }).handler(
  async () => {
    const now = Date.now();
    if (scanCache && now - scanCache.at < SCAN_TTL) {
      return {
        ok: true as const,
        tokens: scanCache.tokens,
        scannedAt: scanCache.at,
        cached: true,
        retryAfterMs: SCAN_TTL - (now - scanCache.at),
      };
    }
    try {
      const tokens = await runScan();
      scanCache = { at: now, tokens };
      return {
        ok: true as const,
        tokens,
        scannedAt: now,
        cached: false,
        retryAfterMs: SCAN_TTL,
      };
    } catch (err) {
      if (scanCache) {
        return {
          ok: true as const,
          tokens: scanCache.tokens,
          scannedAt: scanCache.at,
          cached: true,
          retryAfterMs: SCAN_TTL,
          stale: true,
        };
      }
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Falha no scan",
      };
    }
  },
);

export const xrayToken = createServerFn({ method: "POST" })
  .validator((d: { address: string; chainId?: string; manual?: ManualChecks }) => {
    const address = d.address.trim();
    if (address.length < 2 || address.length > 80) {
      throw new Error("Query inválida");
    }
    return {
      address,
      chainId: d.chainId?.trim() || undefined,
      manual: d.manual,
    };
  })
  .handler(async ({ data }) => {
    let pair: DexPair | null = null;
    if (ADDR_RE.test(data.address)) {
      pair = await lookupAddress(data.address, data.chainId);
    }
    if (!pair) {
      const json = await dexFetch<{ pairs?: DexPair[] }>(
        `/latest/dex/search?q=${encodeURIComponent(data.address)}`,
      );
      pair = pickBestPair(json.pairs ?? [], data.address, data.chainId);
    }
    if (!pair) {
      return { ok: false as const, error: "Token não encontrado na DexScreener" };
    }
    const token = pairToToken(pair);
    if (!token) {
      return { ok: false as const, error: "Par ilegível" };
    }
    if (data.manual) {
      token.score = scoreToken(
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
        data.manual,
      );
    }
    return { ok: true as const, token };
  });

export const getPrices = createServerFn({ method: "POST" })
  .validator((d: { items: { address: string; chainId?: string }[] }) => {
    const items = d.items
      .map((it) => ({
        address: it.address.trim(),
        chainId: it.chainId?.trim() || undefined,
      }))
      .filter((it) => ADDR_RE.test(it.address))
      .slice(0, 20);
    return { items };
  })
  .handler(async ({ data }) => {
    const prices: {
      address: string;
      chainId?: string;
      priceUsd: number;
      symbol?: string;
    }[] = [];
    await Promise.all(
      data.items.map(async (it) => {
        try {
          const pair = await lookupAddress(it.address, it.chainId);
          if (!pair) return;
          prices.push({
            address: it.address,
            chainId: pair.chainId,
            priceUsd: num(pair.priceUsd),
            symbol: pair.baseToken?.symbol,
          });
        } catch {
          // skip
        }
      }),
    );
    return { ok: true as const, prices };
  });

export const getTrendingMetas = createServerFn({ method: "POST" }).handler(
  async () => {
    const raw = await dexFetch<
      {
        name?: string;
        slug?: string;
        description?: string;
        tokenCount?: number;
        marketCap?: number;
        liquidity?: number;
        volume?: number;
        marketCapChange?: Record<string, number>;
      }[]
    >("/metas/trending/v1");
    const metas: TrendingMeta[] = (Array.isArray(raw) ? raw : [])
      .filter((m) => m.slug && m.name)
      .map((m) => ({
        name: m.name!,
        slug: m.slug!,
        description: m.description ?? "",
        tokenCount: num(m.tokenCount),
        marketCap: num(m.marketCap),
        liquidity: num(m.liquidity),
        volume: num(m.volume),
        marketCapChangeH1: m.marketCapChange?.h1,
        marketCapChangeH24: m.marketCapChange?.h24,
      }));
    return { ok: true as const, metas };
  },
);

export const getMetaDetail = createServerFn({ method: "POST" })
  .validator((d: { slug: string }) => {
    const slug = d.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) throw new Error("Narrativa inválida");
    return { slug };
  })
  .handler(async ({ data }) => {
    const raw = await dexFetch<{
      name?: string;
      slug?: string;
      description?: string;
      tokenCount?: number;
      marketCap?: number;
      liquidity?: number;
      volume?: number;
      marketCapChange?: Record<string, number>;
      pairs?: DexPair[];
    }>(`/metas/meta/v1/${encodeURIComponent(data.slug)}`);
    const tokens = (raw.pairs ?? [])
      .map((p) => pairToToken(p))
      .filter((t): t is ScoredToken => Boolean(t))
      .sort((a, b) => b.score.auto - a.score.auto)
      .slice(0, 24);
    const detail: MetaDetail = {
      name: raw.name ?? data.slug,
      slug: raw.slug ?? data.slug,
      description: raw.description ?? "",
      tokenCount: num(raw.tokenCount),
      marketCap: num(raw.marketCap),
      liquidity: num(raw.liquidity),
      volume: num(raw.volume),
      marketCapChangeH1: raw.marketCapChange?.h1,
      marketCapChangeH24: raw.marketCapChange?.h24,
      tokens,
    };
    return { ok: true as const, detail };
  });

export const getUsdEur = createServerFn({ method: "POST" }).handler(async () => {
  const res = await fetch(
    "https://api.frankfurter.app/latest?from=USD&to=EUR",
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) throw new Error("Câmbio indisponível");
  const json = (await res.json()) as { rates?: { EUR?: number } };
  const rate = json.rates?.EUR;
  if (!rate) throw new Error("Câmbio indisponível");
  return { ok: true as const, usdEur: rate };
});
