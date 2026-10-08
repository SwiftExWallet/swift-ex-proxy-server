import { Logger } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';

describe('PortfolioRepository', () => {
  let repository: PortfolioRepository;
  let model: {
    findOne: jest.Mock;
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
    aggregate: jest.Mock;
    updateOne: jest.Mock;
    updateMany: jest.Mock;
  };

  const createQuery = <T>(data?: T) => ({
    exec: jest.fn().mockResolvedValue(data),
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    model = {
      findOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      aggregate: jest.fn(),
      updateOne: jest.fn(),
      updateMany: jest.fn(),
    };
    repository = new PortfolioRepository(model as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('finds a portfolio by address', async () => {
    const portfolio = { address: '0xwallet' };
    const query = createQuery(portfolio);
    model.findOne.mockReturnValue(query);

    await expect(repository.findByAddress('0xwallet')).resolves.toBe(portfolio);

    expect(model.findOne).toHaveBeenCalledWith({ address: '0xwallet' });
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('finds portfolio addresses and tokens by device', async () => {
    const portfolios = [{ address: '0xwallet', tokens: [] }];
    const query = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(portfolios),
    };
    model.find.mockReturnValue(query);

    await expect(repository.findByDevice('device-id')).resolves.toBe(
      portfolios,
    );

    expect(model.find).toHaveBeenCalledWith({ deviceId: 'device-id' });
    expect(query.select).toHaveBeenCalledWith({
      _id: 0,
      address: 1,
      totalValueUsd: 1,
      syncStatus: 1,
      lastSyncedAt: 1,
      updatedAt: 1,
      tokens: 1,
    });
    expect(query.lean).toHaveBeenCalledTimes(1);
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('upserts a fresh idle portfolio for an address', async () => {
    const portfolio = { address: '0xwallet' };
    const query = createQuery(portfolio);
    const tokens = [{ network: 'eth-mainnet', valueUsd: '1' }] as any;
    model.findOneAndUpdate.mockReturnValue(query);

    await expect(
      repository.upsert('device-id', '0xwallet', tokens, '1'),
    ).resolves.toBe(portfolio);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { address: '0xwallet' },
      {
        $set: {
          deviceId: 'device-id',
          tokens,
          totalValueUsd: '1',
          stale: false,
          syncStatus: 'idle',
          lastSyncedAt: expect.any(Date),
          lastSyncError: null,
        },
      },
      { upsert: true, new: true },
    );
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('marks a portfolio sync failure without changing stale state', async () => {
    const query = createQuery();
    model.updateOne.mockReturnValue(query);

    await repository.markFailed('device-id', '0xwallet', 'provider failed');

    expect(model.updateOne).toHaveBeenCalledWith(
      { address: '0xwallet' },
      {
        $set: {
          deviceId: 'device-id',
          syncStatus: 'failed',
          lastSyncError: 'provider failed',
        },
      },
    );
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('re-assigns the owning device for an address', async () => {
    const query = createQuery();
    model.updateOne.mockReturnValue(query);

    await repository.updateDevice('0xwallet', 'new-device-id');

    expect(model.updateOne).toHaveBeenCalledWith(
      { address: '0xwallet' },
      { $set: { deviceId: 'new-device-id' } },
    );
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('marks all records for an address as stale', async () => {
    const query = createQuery();
    model.updateMany.mockReturnValue(query);

    await repository.markStaleByAddress('0xwallet');

    expect(model.updateMany).toHaveBeenCalledWith(
      { address: '0xwallet' },
      { $set: { stale: true } },
    );
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('aggregates token totals by device into token-shaped rows', async () => {
    const query = createQuery([
      {
        network: 'eth-mainnet',
        tokenAddress: null,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        logo: null,
        balanceHex: '0x0',
        balance: 10,
        priceUsd: null,
        valueUsd: 25000,
      },
    ]);
    model.aggregate.mockReturnValue(query);

    await expect(repository.aggregateTotalsByDevice('device-id')).resolves.toEqual(
      [
        {
          network: 'eth-mainnet',
          tokenAddress: null,
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          logo: null,
          balanceHex: '0x0',
          balance: '10',
          priceUsd: null,
          valueUsd: '25000',
        },
      ],
    );

    expect(model.aggregate).toHaveBeenCalledWith([
      { $match: { deviceId: 'device-id' } },
      { $unwind: '$tokens' },
      {
        $match: {
          'tokens.symbol': { $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: { $toUpper: '$tokens.symbol' },
          network: { $first: '$tokens.network' },
          tokenAddress: { $first: '$tokens.tokenAddress' },
          name: { $first: '$tokens.name' },
          decimals: { $first: '$tokens.decimals' },
          logo: { $first: '$tokens.logo' },
          balance: {
            $sum: {
              $convert: {
                input: '$tokens.balance',
                to: 'double',
                onError: 0,
                onNull: 0,
              },
            },
          },
          valueUsd: {
            $sum: {
              $convert: {
                input: '$tokens.valueUsd',
                to: 'double',
                onError: 0,
                onNull: 0,
              },
            },
          },
          priceUsd: { $first: '$tokens.priceUsd' },
        },
      },
      {
        $project: {
          _id: 0,
          network: 1,
          tokenAddress: 1,
          symbol: '$_id',
          name: 1,
          decimals: 1,
          logo: 1,
          balanceHex: '0x0',
          balance: 1,
          priceUsd: 1,
          valueUsd: 1,
        },
      },
      { $sort: { symbol: 1 } },
    ]);
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('returns empty totals when no device portfolios have tokens', async () => {
    const query = createQuery([]);
    model.aggregate.mockReturnValue(query);

    await expect(
      repository.aggregateTotalsByDevice('device-id'),
    ).resolves.toEqual([]);
  });
});
