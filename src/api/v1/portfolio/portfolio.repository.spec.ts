import { Logger } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';

describe('PortfolioRepository', () => {
  let repository: PortfolioRepository;
  let model: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
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
      findOneAndUpdate: jest.fn(),
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
});
