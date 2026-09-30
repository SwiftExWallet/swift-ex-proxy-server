export interface GetPortfolioData {
  addresses: {
    address: string;
    networks: string[];
  }[];
  withMetadata: boolean;
  withPrices: boolean;
  includeNativeTokens: boolean;
  includeErc20Tokens: boolean;
}
