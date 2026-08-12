import { Types } from 'mongoose';
import { swapProvider } from '../common/enums/chain.enum';
import { ExhaustedOrderRepository } from './exhaustedOrder.repository';

describe('ExhaustedOrderRepository', () => {
  let repository: ExhaustedOrderRepository;
  let model: {
    findOneAndUpdate: jest.Mock;
    find: jest.Mock;
    deleteOne: jest.Mock;
  };

  const createQuery = <T>(data?: T) => ({
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(data),
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
    model = {
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
      deleteOne: jest.fn(),
    };
    repository = new ExhaustedOrderRepository(model as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('upserts Fusion+ exhausted orders by transaction hash', async () => {
    await repository.upsertByTxHash('0xhash', {
      provider: swapProvider.ONEINCH_FUSION_PLUS,
      swapOrderId: 'order-id',
      deviceFcmToken: 'fcm-token',
    });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { txHash: '0xhash' },
      {
        txHash: '0xhash',
        exhaustedAt: new Date('2026-01-02T03:04:05.000Z'),
        provider: swapProvider.ONEINCH_FUSION_PLUS,
        swapOrderId: 'order-id',
        deviceFcmToken: 'fcm-token',
      },
      { upsert: true },
    );
  });

  it('upserts reusable-address exhausted orders by swap order id', async () => {
    await repository.upsertBySwapOrderId('order-id', {
      txHash: 'stellar-deposit-address',
      provider: swapProvider.NEARINTENT,
      memo: 'memo',
    });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { swapOrderId: 'order-id' },
      {
        swapOrderId: 'order-id',
        exhaustedAt: new Date('2026-01-02T03:04:05.000Z'),
        txHash: 'stellar-deposit-address',
        provider: swapProvider.NEARINTENT,
        memo: 'memo',
      },
      { upsert: true },
    );
  });

  it('finds pending exhausted orders for a provider since a timestamp', async () => {
    const since = new Date('2026-01-01T00:00:00.000Z');
    const orders = [
      {
        _id: new Types.ObjectId(),
        txHash: '0xhash',
        provider: swapProvider.ONEINCH_FUSION_PLUS,
      },
    ];
    const query = createQuery(orders);
    model.find.mockReturnValue(query);

    await expect(
      repository.findPendingSince(swapProvider.ONEINCH_FUSION_PLUS, since),
    ).resolves.toBe(orders);

    expect(model.find).toHaveBeenCalledWith({
      provider: swapProvider.ONEINCH_FUSION_PLUS,
      exhaustedAt: { $gte: since },
    });
    expect(query.lean).toHaveBeenCalledTimes(1);
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('deletes exhausted orders by transaction hash and by id', async () => {
    const byTxHash = createQuery();
    const byId = createQuery();
    model.deleteOne.mockReturnValueOnce(byTxHash).mockReturnValueOnce(byId);

    await repository.deleteByTxHash('0xhash');
    await repository.deleteById('order-id');

    expect(model.deleteOne).toHaveBeenNthCalledWith(1, { txHash: '0xhash' });
    expect(model.deleteOne).toHaveBeenNthCalledWith(2, { _id: 'order-id' });
    expect(byTxHash.exec).toHaveBeenCalledTimes(1);
    expect(byId.exec).toHaveBeenCalledTimes(1);
  });
});
