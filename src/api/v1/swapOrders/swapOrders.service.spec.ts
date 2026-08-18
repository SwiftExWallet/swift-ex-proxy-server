import { ForbiddenException } from '@nestjs/common';
import { SupportedWalletChain, swapProvider } from '../common/enums/chain.enum';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { SwapOrderService } from './swapOrders.service';

describe('SwapOrderService wallet ownership', () => {
  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    findByTxHash: jest.fn(),
    findByWalletWithPagination: jest.fn(),
    findByTxHashForWallet: jest.fn(),
    updateStatus: jest.fn(),
    updateOrderStatusById: jest.fn(),
  };
  const walletService = {
    verifyWalletForDevice: jest.fn(),
  };
  const redisService = {
    setKey: jest.fn(),
  };
  const nearIntentPollerService = {
    startPolling: jest.fn(),
  };
  const portfolioService = {
    refreshPortfolio: jest.fn(),
  };
  const verifiedWallet = (address: string) =>
    ({
      addresses: new Map([
        [SupportedWalletChain.eth, address],
        [SupportedWalletChain.multi, address],
      ]),
    }) as any;

  let service: SwapOrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SwapOrderService(
      repository as any,
      redisService as any,
      nearIntentPollerService as any,
      portfolioService as any,
    );
  });

  it('stores swap orders through the repository', async () => {
    const device = { _id: 'device-id', fcmToken: 'fcm-token' };
    const dto = {
      txHash: '0xtxhash',
      provider: 'UNISWAP',
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromChain: 'ETH',
      toChain: 'BSC',
      fromToken: 'ETH',
      toToken: 'BNB',
      amountIn: '1',
      amountOut: '2',
      usdValue: 12,
    } as any;
    const created = { _id: 'order-id', ...dto };
    repository.create.mockResolvedValue(created);

    await expect(service.store(device, dto)).resolves.toBe(created);

    expect(repository.create).toHaveBeenCalledWith({
      ...dto,
      usdValue: 12,
      deviceId: 'device-id',
      deviceFcmToken: 'fcm-token',
    });
  });

  it('stores swap orders without device metadata when device is unavailable', async () => {
    const dto = {
      txHash: '0xwebtxhash',
      provider: 'UNISWAP',
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromChain: 'ETH',
      toChain: 'BSC',
      fromToken: 'ETH',
      toToken: 'BNB',
      amountIn: '1',
      amountOut: '2',
      usdValue: 12,
    } as any;
    const created = { _id: 'order-id', ...dto };
    repository.create.mockResolvedValue(created);

    await expect(service.store(undefined, dto)).resolves.toBe(created);

    expect(repository.create).toHaveBeenCalledWith({
      ...dto,
      usdValue: 12,
    });
  });

  it('starts NEAR intent polling with the persisted order id and memo', async () => {
    const device = { _id: 'device-id', fcmToken: 'fcm-token' };
    const dto = {
      txHash: 'near-deposit-address',
      provider: swapProvider.NEARINTENT,
      memo: 'near-memo',
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromChain: 'ETH',
      toChain: 'NEAR',
      fromToken: 'USDC',
      toToken: 'NEAR',
      amountIn: '1',
      amountOut: '2',
      usdValue: 1,
    } as any;
    const created = { _id: { toHexString: () => 'order-id' }, ...dto };
    repository.create.mockResolvedValue(created);
    nearIntentPollerService.startPolling.mockResolvedValue(undefined);

    await expect(service.store(device, dto)).resolves.toBe(created);

    expect(repository.create).toHaveBeenCalledWith({
      ...dto,
      usdValue: 1,
      deviceId: 'device-id',
      deviceFcmToken: 'fcm-token',
    });
    expect(nearIntentPollerService.startPolling).toHaveBeenCalledWith(
      dto.txHash,
      'order-id',
      dto.memo,
    );
  });

  it('finds an order by id through the repository', async () => {
    const result = { ok: true, data: { _id: 'order-id' } };
    repository.findById.mockResolvedValue(result);

    await expect(service.findById('order-id')).resolves.toBe(result);

    expect(repository.findById).toHaveBeenCalledWith('order-id');
  });

  it('refreshes the portfolio after a successful completed status update', async () => {
    const order = {
      txHash: '0xtxhash',
      deviceId: { toString: () => 'device-id' },
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromChain: 'ETH',
      toChain: 'BSC',
    };
    repository.findByTxHash.mockResolvedValue({ ok: true, data: order });
    repository.updateStatus.mockResolvedValue({ ok: true, data: undefined });
    portfolioService.refreshPortfolio.mockResolvedValue(undefined);

    await service.updateOrderStatus('0xtxhash', SwapOrderStatus.COMPLETED);

    expect(repository.updateStatus).toHaveBeenCalledWith(
      '0xtxhash',
      SwapOrderStatus.COMPLETED,
    );
    expect(portfolioService.refreshPortfolio).toHaveBeenCalledWith(
      'device-id',
      order.walletAddress,
      ['ETH', 'BSC'],
    );
  });

  it('skips portfolio refresh after completed status update without device id', async () => {
    const order = {
      txHash: '0xwebtxhash',
      deviceId: null,
      walletAddress: '0x1234567890123456789012345678901234567890',
      fromChain: 'ETH',
      toChain: 'BSC',
    };
    repository.findByTxHash.mockResolvedValue({ ok: true, data: order });
    repository.updateStatus.mockResolvedValue({ ok: true, data: undefined });

    await expect(
      service.updateOrderStatus('0xwebtxhash', SwapOrderStatus.COMPLETED),
    ).resolves.toEqual({ ok: true, data: undefined });

    expect(portfolioService.refreshPortfolio).not.toHaveBeenCalled();
  });

  it('returns wallet orders for the verified wallet without rechecking device ownership', async () => {
    const query = {
      address: '0x1234567890123456789012345678901234567890',
      page: 1,
      limit: 10,
    };
    const result = { ok: true, data: { data: [], total: 0 } };
    repository.findByWalletWithPagination.mockResolvedValue(result);

    await expect(
      service.findOrdersForVerifiedWallet(query, verifiedWallet(query.address)),
    ).resolves.toBe(result);

    expect(walletService.verifyWalletForDevice).not.toHaveBeenCalled();
    expect(repository.findByWalletWithPagination).toHaveBeenCalledWith(
      query.address,
      query,
    );
  });

  it('applies the verified wallet before looking up order history', async () => {
    const query = {
      address: '0x9999999999999999999999999999999999999999',
      page: 1,
      limit: 10,
    };
    const walletAddress = '0x1234567890123456789012345678901234567890';
    const result = { ok: true, data: { data: [], total: 0 } };
    repository.findByWalletWithPagination.mockResolvedValue(result);

    await expect(
      service.findOrdersForVerifiedWallet(
        { ...query, address: walletAddress },
        verifiedWallet(walletAddress),
      ),
    ).resolves.toBe(result);

    expect(walletService.verifyWalletForDevice).not.toHaveBeenCalled();
    expect(repository.findByWalletWithPagination).toHaveBeenCalledWith(
      walletAddress,
      { ...query, address: walletAddress },
    );
  });

  it('rejects wallet order history when the query address is not in the verified wallet', async () => {
    const query = {
      address: '0x1234567890123456789012345678901234567890',
      page: 1,
      limit: 10,
    };

    await expect(
      service.findOrdersForVerifiedWallet(
        query,
        verifiedWallet('0x9999999999999999999999999999999999999999'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(walletService.verifyWalletForDevice).not.toHaveBeenCalled();
    expect(repository.findByWalletWithPagination).not.toHaveBeenCalled();
  });

  it('returns an order by hash for the verified wallet without rechecking device ownership', async () => {
    const result = { ok: true, data: null };
    repository.findByTxHashForWallet.mockResolvedValue(result);
    const walletAddress = '0x1234567890123456789012345678901234567890';

    await expect(
      service.findOrderByHashForVerifiedWallet(
        '0xorderhash',
        walletAddress,
        verifiedWallet(walletAddress),
      ),
    ).resolves.toBe(result);

    expect(walletService.verifyWalletForDevice).not.toHaveBeenCalled();
    expect(repository.findByTxHashForWallet).toHaveBeenCalledWith(
      '0xorderhash',
      walletAddress,
    );
  });
});
