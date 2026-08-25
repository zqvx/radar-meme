export type SocialLink = {
  platform: string;
  url?: string;
  handle?: string;
};

export type ScoreSlice = {
  key: "age" | "mcap" | "volMcap" | "liquidity" | "momentum";
  label: string;
  points: number;
  max: number;
  detail: string;
};

export type RedFlag = {
  code: string;
  label: string;
  detail: string;
  penalty: number;
  severity: "warn" | "bad";
};

export type ManualChecks = {
  catalysis: boolean;
  social: boolean;
  lpBurned: boolean;
};

export type ScoreCard = {
  slices: ScoreSlice[];
  flags: RedFlag[];
  auto: number;
  autoMax: 80;
  manual: number;
  manualMax: 20;
  total: number;
  totalMax: 100;
  verdict: "go" | "caution" | "avoid";
  verdictLabel: string;
};

export type ScoredToken = {
  chainId: string;
  tokenAddress: string;
  pairAddress: string;
  dexId: string;
  url: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  description?: string;
  websites: string[];
  socials: SocialLink[];
  priceUsd: number;
  marketCap: number;
  fdv: number;
  liquidityUsd: number;
  volumeH24: number;
  volumeH1: number;
  priceChangeH1: number;
  priceChangeH24: number;
  buysH24: number;
  sellsH24: number;
  pairCreatedAt: number;
  boostsActive: number;
  boostAmount: number;
  narrative?: string;
  score: ScoreCard;
};

export type TrendingMeta = {
  name: string;
  slug: string;
  description: string;
  tokenCount: number;
  marketCap: number;
  liquidity: number;
  volume: number;
  marketCapChangeH1?: number;
  marketCapChangeH24?: number;
};

export type MetaDetail = TrendingMeta & {
  tokens: ScoredToken[];
};

export type Catalysis = {
  id: string;
  title: string;
  date: string;
  note: string;
  source: "curated" | "user";
  tag?: string;
};

export type Bet = {
  id: string;
  name: string;
  address?: string;
  chainId?: string;
  stakeEur: number;
  entryPriceUsd: number;
  entryAt: string;
  notes: string;
  closedAt?: string;
  exitPriceUsd?: number;
};
