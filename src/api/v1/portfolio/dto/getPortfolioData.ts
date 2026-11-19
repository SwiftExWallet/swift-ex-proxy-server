// Request body shape for Alchemy's "tokens by address" Data API
// (https://api.g.alchemy.com/data/v1/{apiKey}/assets/tokens/by-address).
// Internal to PortfolioService - not a request DTO, so no class-validator here.
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
