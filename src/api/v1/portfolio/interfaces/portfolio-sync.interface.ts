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
