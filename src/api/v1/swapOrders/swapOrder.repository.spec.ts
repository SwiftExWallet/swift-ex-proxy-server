import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrderRepository } from './swapOrder.repository';

describe('SwapOrderRepository', () => {
  let repository: SwapOrderRepository;
  let model: jest.Mock & {
    findOne: jest.Mock;
    find: jest.Mock;
    exists: jest.Mock;
    updateOne: jest.Mock;
    countDocuments: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let save: jest.Mock;
  const portfolioService = {
    refreshPortfolio: jest.fn(),
  };

  const publicOrderSelect = '-deviceId -deviceFcmToken';

  const createQuery = <T>(data: T) => {
    const query = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(data),
    };

    return query;
  };

  const createDto = () =>
    ({
      txHash: '0xtxhash',
      provider: swapProvider.UNISWAP,
      walletAddress: '0xwallet',
      fromChain: 'ETH',
      toChain: 'BSC',
      fromToken: 'ETH',
      toToken: 'BNB',
      amountIn: '1',
      amountOut: '2',
      deviceFcmToken: 'fcm-token',
    }) as any;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    save = jest.fn();
    model = jest.fn().mockImplementation(function (this: any, data: any) {
      Object.assign(this, data);
      this.save = save;
    }) as any;
    model.findOne = jest.fn();
    model.find = jest.fn();
    model.exists = jest.fn();
    model.updateOne = jest.fn();
    model.countDocuments = jest.fn();
    model.findOneAndUpdate = jest.fn();
    portfolioService.refreshPortfolio.mockReset();
    portfolioService.refreshPortfolio.mockResolvedValue(undefined);

    repository = new SwapOrderRepository(model as any, portfolioService as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a swap order with pending status and empty confirmation fields', async () => {
    const dto = createDto();
    const created = { _id: 'order-id', ...dto };
    save.mockResolvedValue(created);

    await expect(repository.create(dto)).resolves.toBe(created);

    expect(model).toHaveBeenCalledWith({
      ...dto,
      status: SwapOrderStatus.PENDING,
      blockNumber: null,
      confirmedAt: null,
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicit status when creating a swap order', async () => {
    const dto = {
      ...createDto(),
      status: SwapOrderStatus.CREATED,
    };
    const created = { _id: 'order-id', ...dto };
    save.mockResolvedValue(created);

    await expect(repository.create(dto)).resolves.toBe(created);

    expect(model).toHaveBeenCalledWith({
      ...dto,
      status: SwapOrderStatus.CREATED,
      blockNumber: null,
      confirmedAt: null,
    });
  });

  it('throws conflict when creating a duplicate transaction hash', async () => {
    const dto = createDto();
    save.mockRejectedValue({ code: 11000 });

    await expect(repository.create(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('finds an order by transaction hash', async () => {
    const order = { txHash: '0xtxhash' };
    const query = createQuery(order);
    model.findOne.mockReturnValue(query);

    await expect(repository.findByTxHash('0xtxhash')).resolves.toEqual({
      ok: true,
      data: order,
    });
    expect(model.findOne).toHaveBeenCalledWith({ txHash: '0xtxhash' });
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('returns an error result when transaction hash lookup fails', async () => {
    const query = createQuery(null);
    query.exec.mockRejectedValue(new Error('db failed'));
    model.findOne.mockReturnValue(query);

    await expect(repository.findByTxHash('0xtxhash')).resolves.toEqual({
      ok: false,
      error: 'findByTxHash failed',
    });
  });

  it('finds a public order by transaction hash and wallet', async () => {
    const order = { txHash: '0xtxhash', walletAddress: '0xwallet' };
    const query = createQuery(order);
    model.findOne.mockReturnValue(query);

    await expect(
      repository.findByTxHashForWallet('0xtxhash', '0xwallet'),
    ).resolves.toEqual({
      ok: true,
      data: order,
    });

    expect(model.findOne).toHaveBeenCalledWith({
      txHash: '0xtxhash',
      walletAddress: '0xwallet',
    });
    expect(query.select).toHaveBeenCalledWith(publicOrderSelect);
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('finds public orders for a wallet across devices', async () => {
    const orders = [{ txHash: '0xtxhash' }];
    const query = createQuery(orders);
    model.find.mockReturnValue(query);

    await expect(repository.findByWallet('0xwallet')).resolves.toEqual({
      ok: true,
      data: orders,
    });

    expect(model.find).toHaveBeenCalledWith({
      walletAddress: '0xwallet',
    });
    expect(query.sort).toHaveBeenCalledWith({ _id: -1 });
    expect(query.select).toHaveBeenCalledWith(publicOrderSelect);
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('checks whether a wallet belongs to a device', async () => {
    const query = createQuery({ _id: 'order-id' });
    model.exists.mockReturnValue(query);

    await expect(
      repository.walletBelongsToDevice('device-id', '0xwallet'),
    ).resolves.toEqual({
      ok: true,
      data: true,
    });

    expect(model.exists).toHaveBeenCalledWith({
      deviceId: 'device-id',
      walletAddress: '0xwallet',
    });
  });

  it('returns false when wallet-device order history does not exist', async () => {
    const query = createQuery(null);
    model.exists.mockReturnValue(query);

    await expect(
      repository.walletBelongsToDevice('device-id', '0xwallet'),
    ).resolves.toEqual({
      ok: true,
      data: false,
    });
  });

  it('finds pending orders by provider', async () => {
    const orders = [{ txHash: '0xtxhash' }];
    const query = createQuery(orders);
    model.find.mockReturnValue(query);

    await expect(
      repository.findPendingByProvider(swapProvider.ONEINCH_FUSION),
    ).resolves.toEqual({
      ok: true,
      data: orders,
    });

    expect(model.find).toHaveBeenCalledWith({
      provider: swapProvider.ONEINCH_FUSION,
      status: SwapOrderStatus.PENDING,
    });
    expect(query.lean).toHaveBeenCalledTimes(1);
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('finds pending orders by provider since a date', async () => {
    const since = new Date('2026-01-01T00:00:00.000Z');
    const orders = [{ txHash: '0xtxhash' }];
    const query = createQuery(orders);
    model.find.mockReturnValue(query);

    await expect(
      repository.findPendingByProviderSince(
        swapProvider.ONEINCH_FUSION_PLUS,
        since,
      ),
    ).resolves.toEqual({
      ok: true,
      data: orders,
    });

    expect(model.find).toHaveBeenCalledWith({
      provider: swapProvider.ONEINCH_FUSION_PLUS,
      status: SwapOrderStatus.PENDING,
      createdAt: { $gte: since },
    });
    expect(query.lean).toHaveBeenCalledTimes(1);
  });

  it('finds provider orders by statuses since a date', async () => {
    const since = new Date('2026-01-01T00:00:00.000Z');
    const statuses = [SwapOrderStatus.FILLED, SwapOrderStatus.REFUNDED];
    const orders = [{ txHash: '0xtxhash' }];
    const query = createQuery(orders);
    model.find.mockReturnValue(query);

    await expect(
      repository.findByProviderAndStatusesSince(
        swapProvider.ONEINCH_FUSION_PLUS,
        statuses,
        since,
      ),
    ).resolves.toEqual({
      ok: true,
      data: orders,
    });

    expect(model.find).toHaveBeenCalledWith({
      provider: swapProvider.ONEINCH_FUSION_PLUS,
      status: { $in: statuses },
      createdAt: { $gte: since },
    });
    expect(query.lean).toHaveBeenCalledTimes(1);
  });

  it('updates order status by transaction hash', async () => {
    const updatedOrder = {
      txHash: '0xtxhash',
      deviceId: { toString: () => 'device-id' },
      walletAddress: '0xwallet',
      fromChain: 'ETH',
      toChain: 'BSC',
    };
    const query = createQuery(updatedOrder);
    model.findOneAndUpdate.mockReturnValue(query);

    await expect(
      repository.updateStatus('0xtxhash', SwapOrderStatus.COMPLETED, 123),
    ).resolves.toEqual({
      ok: true,
      data: undefined,
    });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { txHash: '0xtxhash' },
      {
        $set: {
          status: SwapOrderStatus.COMPLETED,
          confirmedAt: expect.any(Date),
          blockNumber: 123,
        },
      },
      { new: true },
    );
    expect(portfolioService.refreshPortfolio).toHaveBeenCalledWith(
      'device-id',
      updatedOrder.walletAddress,
      ['ETH', 'BSC'],
    );
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('returns an error result when updating status finds no order', async () => {
    const query = createQuery(null);
    model.findOneAndUpdate.mockReturnValue(query);

    await expect(
      repository.updateStatus('0xtxhash', SwapOrderStatus.COMPLETED),
    ).resolves.toEqual({
      ok: false,
      error: 'updateStatus no data found',
    });
  });

  it('finds wallet orders with pagination across devices', async () => {
    const orders = [{ txHash: '0xtxhash' }];
    const query = createQuery(orders);
    model.countDocuments.mockResolvedValue(12);
    model.find.mockReturnValue(query);

    await expect(
      repository.findByWalletWithPagination('0xwallet', { page: 2, limit: 5 }),
    ).resolves.toEqual({
      ok: true,
      data: {
        data: orders,
        total: 12,
        page: 2,
        limit: 5,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      },
    });

    expect(model.countDocuments).toHaveBeenCalledWith({
      walletAddress: '0xwallet',
    });
    expect(model.find).toHaveBeenCalledWith({
      walletAddress: '0xwallet',
    });
    expect(query.select).toHaveBeenCalledWith(publicOrderSelect);
    expect(query.sort).toHaveBeenCalledWith({ _id: -1 });
    expect(query.skip).toHaveBeenCalledWith(5);
    expect(query.limit).toHaveBeenCalledWith(5);
    expect(query.exec).toHaveBeenCalledTimes(1);
  });

  it('updates and returns an order status', async () => {
    const updatedOrder = {
      txHash: '0xtxhash',
      status: SwapOrderStatus.FAILED,
    };
    model.findOneAndUpdate.mockResolvedValue(updatedOrder);

    await expect(
      repository.updateOrderStatus('0xtxhash', SwapOrderStatus.FAILED, 456),
    ).resolves.toBe(updatedOrder);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { txHash: '0xtxhash' },
      {
        $set: {
          status: SwapOrderStatus.FAILED,
          confirmedAt: expect.any(Date),
          blockNumber: 456,
        },
      },
      {
        new: true,
      },
    );
  });

  it('throws bad request when updateOrderStatus cannot find an order', async () => {
    model.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      repository.updateOrderStatus('0xtxhash', SwapOrderStatus.FAILED),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
