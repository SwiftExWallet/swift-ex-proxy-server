export interface AlchemyTokenPrice {
  currency: string;
  value: string;
  lastUpdatedAt: string;
}

export interface AlchemyTokenMetadata {
  symbol: string | null;
  decimals: number | null;
  name: string | null;
  logo: string | null;
}

export interface AlchemyTokenEntry {
  address: string;
  network: string;
  tokenAddress: string | null;
  tokenBalance: string;
  tokenMetadata: AlchemyTokenMetadata;
  tokenPrices: AlchemyTokenPrice[];
}

export interface AlchemyPortfolioResponse {
  data: {
    tokens: AlchemyTokenEntry[];
  };
}

export interface PortfolioResponse {
  address: string;
  totalValueUsd: string;
  stale: boolean;
  syncStatus: string;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  tokens: {
    network: string;
    tokenAddress: string | null;
    symbol: string | null;
    name: string | null;
    decimals: number | null;
    logo: string | null;
    balanceHex: string;
    balance: string | null;
    priceUsd: string | null;
    valueUsd: string | null;
  }[];
}
