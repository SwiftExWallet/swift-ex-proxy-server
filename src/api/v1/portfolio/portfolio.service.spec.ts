import axios from 'axios';
import { BadGatewayException, Logger } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';

jest.mock('axios');

describe('PortfolioService', () => {
  let service: PortfolioService;
  let repository: {
    findByAddress: jest.Mock;
    upsert: jest.Mock;
    markFailed: jest.Mock;
  };
  let mapper: {
    normalize: jest.Mock;
    resolveAlchemyNetwork: jest.Mock;
  };
  const axiosPost = axios.post as jest.Mock;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ALCHEMY_PORTFOLIO_KEY: 'portfolio-key',
      ALCHEMY_PORTFOLIO_NETWORKS: '',
    };
    repository = {
      findByAddress: jest.fn(),
      upsert: jest.fn(),
      markFailed: jest.fn(),
    };
    mapper = {
      normalize: jest.fn(),
      resolveAlchemyNetwork: jest.fn(
        (chain: string) => ({ ETH: 'eth-mainnet', BSC: 'bnb-mainnet' })[chain],
      ),
    };
    service = new PortfolioService(repository as any, mapper as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('returns a fresh cached portfolio without calling Alchemy', async () => {
    const portfolio = {
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      stale: false,
    };
    repository.findByAddress.mockResolvedValue(portfolio);

    await expect(
      service.getPortfolio(
        'device-id',
        '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      ),
    ).resolves.toBe(portfolio);

    expect(repository.findByAddress).toHaveBeenCalledWith(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );
    expect(axiosPost).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('syncs a stale EVM portfolio using a normalized address', async () => {
    const tokens = [{ network: 'eth-mainnet', valueUsd: '2' }];
    repository.findByAddress.mockResolvedValue({ stale: true });
    repository.upsert.mockResolvedValue({ address: '0xwallet' });
    axiosPost.mockResolvedValue({ data: { data: { tokens: [] } } });
    mapper.normalize.mockReturnValue({ tokens, totalValueUsd: '2' });

    await service.getPortfolio(
      'device-id',
      '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
    );

    expect(axiosPost).toHaveBeenCalledWith(
      'https://api.g.alchemy.com/data/v1/portfolio-key/assets/tokens/by-address',
      expect.objectContaining({
        addresses: [
          expect.objectContaining({
            address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          }),
        ],
      }),
    );
    expect(repository.upsert).toHaveBeenCalledWith(
      'device-id',
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tokens,
      '2',
    );
  });

  it('refreshes requested networks and preserves tokens from other networks', async () => {
    const existing = {
      tokens: [
        { network: 'eth-mainnet', valueUsd: '1' },
        { network: 'bnb-mainnet', valueUsd: '3' },
      ],
    };
    const freshBscTokens = [{ network: 'bnb-mainnet', valueUsd: '4' }];
    repository.findByAddress.mockResolvedValue(existing);
    axiosPost.mockResolvedValue({ data: { data: { tokens: [] } } });
    mapper.normalize.mockReturnValue({
      tokens: freshBscTokens,
      totalValueUsd: '4',
    });

    await service.refreshPortfolio('device-id', '0xWallet', ['BSC']);

    expect(axiosPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        addresses: [
          expect.objectContaining({
            address: '0xwallet',
            networks: ['bnb-mainnet'],
          }),
        ],
      }),
    );
    expect(repository.upsert).toHaveBeenCalledWith(
      'device-id',
      '0xwallet',
      [
        { network: 'eth-mainnet', valueUsd: '1' },
        { network: 'bnb-mainnet', valueUsd: '4' },
      ],
      '5',
    );
  });

  it('returns stale existing portfolio after a provider failure', async () => {
    const existing = { address: '0xwallet', stale: true };
    repository.findByAddress.mockResolvedValue(existing);
    axiosPost.mockRejectedValue(new Error('alchemy failed'));

    await expect(service.getPortfolio('device-id', '0xWallet')).resolves.toBe(
      existing,
    );

    expect(repository.markFailed).toHaveBeenCalledWith(
      'device-id',
      '0xwallet',
      'alchemy failed',
    );
  });

  it('throws bad gateway when an initial provider sync fails', async () => {
    repository.findByAddress.mockResolvedValue(null);
    axiosPost.mockRejectedValue(new Error('alchemy failed'));

    await expect(
      service.getPortfolio('device-id', '0xWallet'),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(repository.markFailed).not.toHaveBeenCalled();
  });
});
