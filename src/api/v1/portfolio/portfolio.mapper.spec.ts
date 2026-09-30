import { PortfolioMapper } from './portfolio.mapper';
import { Portfolio, PortfolioToken } from './schema/portfolio.schema';

describe('PortfolioMapper.toAlchemyResponse', () => {
  const mapper = new PortfolioMapper();

  it('projects a stored portfolio document into the client-facing shape', () => {
    const lastSyncedAt = new Date();
    const portfolio = {
      address: '0xwallet',
      totalValueUsd: '42.5',
      stale: false,
      syncStatus: 'idle',
      lastSyncedAt,
      lastSyncError: null,
      tokens: [
        {
          network: 'eth-mainnet',
          tokenAddress: null,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          logo: null,
          balanceHex: '0x1',
          balance: '1',
          priceUsd: '2500',
          valueUsd: '2500',
        } as PortfolioToken,
      ],
    } as unknown as Portfolio;

    expect(mapper.toAlchemyResponse(portfolio)).toEqual({
      address: '0xwallet',
      totalValueUsd: '42.5',
      stale: false,
      syncStatus: 'idle',
      lastSyncedAt,
      lastSyncError: null,
      tokens: [
        {
          network: 'eth-mainnet',
          tokenAddress: null,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          logo: null,
          balanceHex: '0x1',
          balance: '1',
          priceUsd: '2500',
          valueUsd: '2500',
        },
      ],
    });
  });
});
