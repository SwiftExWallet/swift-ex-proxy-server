import { Logger } from '@nestjs/common';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { UniswapTxPollerService } from './uniswapTxPoller.service';

describe('UniswapTxPollerService', () => {
  let service: UniswapTxPollerService;
  let swapOrderService: {
    findPendingByProvider: jest.Mock;
    updateOrderByHash: jest.Mock;
  };
  let firebaseNotificationService: {
    sendNotification: jest.Mock;
  };
  let txReceiptStatusService: {
    getStatus: jest.Mock;
  };

  const createTx = (overrides: Record<string, any> = {}) =>
    ({
      txHash: '0xhash',
      fromChain: 'ETH',
      walletAddress: '0x1234567890123456789012345678901234567890',
      amountOut: '10',
      toToken: 'USDC',
      deviceFcmToken: 'fcm-token',
      txType: 'Swap',
      ...overrides,
    }) as any;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    swapOrderService = {
      findPendingByProvider: jest.fn(),
      updateOrderByHash: jest.fn(),
    };
    firebaseNotificationService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    txReceiptStatusService = {
      getStatus: jest.fn(),
    };
    service = new UniswapTxPollerService(
      swapOrderService as any,
      firebaseNotificationService as any,
      txReceiptStatusService as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries pending Uniswap swap orders', async () => {
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [],
    });

    await service.poll();

    expect(swapOrderService.findPendingByProvider).toHaveBeenCalledWith(
      swapProvider.UNISWAP,
    );
    expect(txReceiptStatusService.getStatus).not.toHaveBeenCalled();
  });

  it('returns without polling when service fetch fails', async () => {
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: false,
      error: 'db failed',
    });

    await service.poll();

    expect(txReceiptStatusService.getStatus).not.toHaveBeenCalled();
    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
  });

  it('returns without polling when there are no pending orders', async () => {
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [],
    });

    await service.poll();

    expect(txReceiptStatusService.getStatus).not.toHaveBeenCalled();
    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
  });

  it('skips orders while receipt status is still unknown', async () => {
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [createTx({ fromChain: 'SRB' })],
    });
    txReceiptStatusService.getStatus.mockResolvedValue(null);

    await service.poll();

    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
  });

  it('maps a successful Blockscout receipt to completed and sends a notification', async () => {
    const tx = createTx();
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [tx],
    });
    txReceiptStatusService.getStatus.mockResolvedValue(
      SwapOrderStatus.COMPLETED,
    );
    swapOrderService.updateOrderByHash.mockResolvedValue({
      ...tx,
      txType: 'Swap',
    });

    await service.poll();

    expect(txReceiptStatusService.getStatus).toHaveBeenCalledWith(
      tx.fromChain,
      tx.txHash,
    );
    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: tx.txHash,
      orderStatus: SwapOrderStatus.COMPLETED,
    });
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledWith(
      tx.deviceFcmToken,
      {
        title: `Order Completed: ${tx.amountOut} ${tx.toToken}`,
        body: 'From 0x12.....7890',
        data: { network: tx.fromChain, txHash: tx.txHash },
      },
    );
  });

  it('maps a failed Blockscout receipt to failed status', async () => {
    const tx = createTx();
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [tx],
    });
    txReceiptStatusService.getStatus.mockResolvedValue(SwapOrderStatus.FAILED);
    swapOrderService.updateOrderByHash.mockResolvedValue({
      ...tx,
      txType: 'Swap',
    });

    await service.poll();

    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: tx.txHash,
      orderStatus: SwapOrderStatus.FAILED,
    });
  });

  it('skips notification when completed web orders have no device token', async () => {
    const tx = createTx({ deviceFcmToken: null });
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [tx],
    });
    txReceiptStatusService.getStatus.mockResolvedValue(
      SwapOrderStatus.COMPLETED,
    );
    swapOrderService.updateOrderByHash.mockResolvedValue(tx);

    await service.poll();

    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: tx.txHash,
      orderStatus: SwapOrderStatus.COMPLETED,
    });
    expect(firebaseNotificationService.sendNotification).not.toHaveBeenCalled();
  });

  it('does not notify when the order update fails', async () => {
    const tx = createTx();
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [tx],
    });
    txReceiptStatusService.getStatus.mockResolvedValue(
      SwapOrderStatus.COMPLETED,
    );
    swapOrderService.updateOrderByHash.mockResolvedValue(null);

    await service.poll();

    expect(firebaseNotificationService.sendNotification).not.toHaveBeenCalled();
  });
});
