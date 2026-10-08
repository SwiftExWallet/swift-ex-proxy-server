import { BadGatewayException, Logger } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let service: PortfolioService;
  let httpService: { post: jest.Mock };
  let repository: {
    findByAddress: jest.Mock;
    aggregateTotalsByDevice: jest.Mock;
    findByDevice: jest.Mock;
    upsert: jest.Mock;
    markFailed: jest.Mock;
    updateDevice: jest.Mock;
  };
  let mapper: {
    normalize: jest.Mock;
    resolveAlchemyNetwork: jest.Mock;
    toAlchemyResponse: jest.Mock;
  };
  const originalEnv = process.env;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    process.env = {
      ...originalEnv,
      ALCHEMY_PORTFOLIO_KEY: 'portfolio-key',
      ALCHEMY_PORTFOLIO_NETWORKS: '',
      PORTFOLIO_SYNC_TTL_SECONDS: '35',
    };
    httpService = { post: jest.fn() };
    repository = {
      findByAddress: jest.fn(),
      aggregateTotalsByDevice: jest.fn(),
      findByDevice: jest.fn(),
      upsert: jest.fn(),
      markFailed: jest.fn(),
      updateDevice: jest.fn(),
    };
    mapper = {
      normalize: jest.fn(),
      resolveAlchemyNetwork: jest.fn(
        (chain: string) => ({ ETH: 'eth-mainnet', BSC: 'bnb-mainnet' })[chain],
      ),
      // identity passthrough is enough for these tests - toAlchemyResponse's
      // own mapping is covered by portfolio.mapper.spec.ts
      toAlchemyResponse: jest.fn((portfolio) => portfolio),
    };
    service = new PortfolioService(
      httpService as any,
      repository as any,
      mapper as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('returns a fresh cached portfolio without calling Alchemy', async () => {
    const portfolio = {
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      deviceId: 'device-id',
      stale: false,
      lastSyncedAt: new Date(),
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
    expect(httpService.post).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
    expect(repository.updateDevice).not.toHaveBeenCalled();
  });

  it('re-attaches the requesting device to a fresh portfolio synced by another device', async () => {
    const portfolio = {
      address: '0xwallet',
      deviceId: 'other-device',
      stale: false,
      lastSyncedAt: new Date(),
    };
    repository.findByAddress.mockResolvedValue(portfolio);

    await service.getPortfolio('device-id', '0xWallet');

    expect(repository.updateDevice).toHaveBeenCalledWith(
      '0xwallet',
      'device-id',
    );
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('syncs a stale EVM portfolio using a normalized address', async () => {
    const tokens = [{ network: 'eth-mainnet', valueUsd: '2' }];
    repository.findByAddress.mockResolvedValue({ stale: true });
    repository.upsert.mockResolvedValue({ address: '0xwallet' });
    httpService.post.mockResolvedValue({ data: { data: { tokens: [] } } });
    mapper.normalize.mockReturnValue({ tokens, totalValueUsd: '2' });

    await service.getPortfolio(
      'device-id',
      '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
    );

    expect(httpService.post).toHaveBeenCalledWith(
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

  it('does not force a refetch when hardRefresh is set but the sync TTL has not elapsed', async () => {
    const portfolio = {
      address: '0xwallet',
      deviceId: 'device-id',
      stale: false,
      lastSyncedAt: new Date(),
    };
    repository.findByAddress.mockResolvedValue(portfolio);

    await service.getPortfolio('device-id', '0xWallet', true);

    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('forces a refetch when hardRefresh is set and the sync TTL has elapsed', async () => {
    const portfolio = {
      address: '0xwallet',
      deviceId: 'device-id',
      stale: false,
      lastSyncedAt: new Date(Date.now() - 60_000),
    };
    repository.findByAddress.mockResolvedValue(portfolio);
    repository.upsert.mockResolvedValue({ address: '0xwallet' });
    httpService.post.mockResolvedValue({ data: { data: { tokens: [] } } });
    mapper.normalize.mockReturnValue({ tokens: [], totalValueUsd: '0' });

    await service.getPortfolio('device-id', '0xWallet', true);

    expect(httpService.post).toHaveBeenCalled();
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
    httpService.post.mockResolvedValue({ data: { data: { tokens: [] } } });
    mapper.normalize.mockReturnValue({
      tokens: freshBscTokens,
      totalValueUsd: '4',
    });

    await service.refreshPortfolio('device-id', '0xWallet', ['BSC']);

    expect(httpService.post).toHaveBeenCalledWith(
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
    httpService.post.mockRejectedValue(new Error('alchemy failed'));

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
    httpService.post.mockRejectedValue(new Error('alchemy failed'));

    await expect(
      service.getPortfolio('device-id', '0xWallet'),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('returns the requested device portfolio response structure', async () => {
    const assets = [
      {
        network: 'base-mainnet',
        tokenAddress: null,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logo: null,
        balanceHex: '0x0',
        balance: '0.5',
        priceUsd: '3400.50',
        valueUsd: '1700.25',
      },
      {
        network: 'base-mainnet',
        tokenAddress: '0xusdc',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logo: 'https://example.com/usdc.png',
        balanceHex: '0x0',
        balance: '250.5',
        priceUsd: '1',
        valueUsd: '250.50',
      },
    ];
    const portfolios = [
      {
        address: '0xwallet',
        totalValueUsd: '1950.75',
        syncStatus: 'idle',
        lastSyncedAt: new Date('2026-10-03T07:20:00.000Z'),
        updatedAt: new Date('2026-10-03T07:21:00.000Z'),
        tokens: assets,
      },
    ];
    repository.aggregateTotalsByDevice.mockResolvedValue(assets);
    repository.findByDevice.mockResolvedValue(portfolios);

    await expect(
      service.getDevicePortfolioTotals('device-id'),
    ).resolves.toEqual({
      success: true,
      data: {
        device: {
          id: 'device-id',
          maskedId: '••••e-id',
          isSynced: true,
          lastUpdated: '2026-10-03T07:21:00.000Z',
        },
        summary: {
          totalValueUsd: 1950.75,
          portfolioCount: 1,
          assetCount: 2,
          networkCount: 1,
        },
        networks: [
          {
            network: 'base-mainnet',
            name: 'Base',
            symbol: 'ETH',
            valueUsd: 1950.75,
            assetCount: 2,
          },
        ],
        assets: [
          {
            ...assets[0],
            priceUsd: 3400.5,
            valueUsd: 1700.25,
          },
          {
            ...assets[1],
            priceUsd: 1,
            valueUsd: 250.5,
          },
        ],
        portfolios: [
          {
            id: '01',
            address: '0xwallet',
            name: 'Portfolio #01',
            valueUsd: 1950.75,
            assets: [
              {
                ...assets[0],
                priceUsd: 3400.5,
                valueUsd: 1700.25,
              },
              {
                ...assets[1],
                priceUsd: 1,
                valueUsd: 250.5,
              },
            ],
          },
        ],
      },
    });

    expect(repository.aggregateTotalsByDevice).toHaveBeenCalledWith(
      'device-id',
    );
    expect(repository.findByDevice).toHaveBeenCalledWith('device-id');
  });

  it('handles object device ids when building device metadata', async () => {
    const deviceId = {
      toString: () => '507f1f77bcf86cd799439011',
    };
    repository.aggregateTotalsByDevice.mockResolvedValue([]);
    repository.findByDevice.mockResolvedValue([]);

    await expect(
      service.getDevicePortfolioTotals(deviceId as any),
    ).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          device: expect.objectContaining({
            id: '507f1f77bcf86cd799439011',
            maskedId: '••••9011',
          }),
        }),
      }),
    );

    expect(repository.aggregateTotalsByDevice).toHaveBeenCalledWith(deviceId);
    expect(repository.findByDevice).toHaveBeenCalledWith(deviceId);
  });
});
