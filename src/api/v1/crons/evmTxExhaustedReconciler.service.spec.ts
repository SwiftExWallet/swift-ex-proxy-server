import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { EvmTxExhaustedReconcilerService } from './evmTxExhaustedReconciler.service';

describe('EvmTxExhaustedReconcilerService', () => {
  let service: EvmTxExhaustedReconcilerService;
  let exhaustedOrderService: {
    findPendingSince: jest.Mock;
    deleteById: jest.Mock;
  };
  let swapOrderService: {
    findByTxHash: jest.Mock;
    updateOrderByHash: jest.Mock;
  };
  let txReceiptStatusService: {
    getStatus: jest.Mock;
  };
  let firebaseNotificationService: {
    sendNotification: jest.Mock;
  };

  const createExhaustedOrder = (overrides: Record<string, any> = {}) => ({
    _id: new Types.ObjectId('64f000000000000000000001'),
    txHash: '0xhash',
    provider: swapProvider.EVMTX,
    exhaustedAt: new Date('2026-08-12T00:00:00.000Z'),
    ...overrides,
  });

  const createSwapOrder = (overrides: Record<string, any> = {}) => ({
    txHash: '0xhash',
    fromChain: 'ETH',
    walletAddress: '0x1234567890123456789012345678901234567890',
    amountOut: '10',
    toToken: 'USDC',
    deviceFcmToken: 'fcm-token',
    ...overrides,
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    exhaustedOrderService = {
      findPendingSince: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
    };
    swapOrderService = {
      findByTxHash: jest.fn(),
      updateOrderByHash: jest.fn(),
    };
    txReceiptStatusService = {
      getStatus: jest.fn(),
    };
    firebaseNotificationService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };

    service = new EvmTxExhaustedReconcilerService(
      exhaustedOrderService as any,
      swapOrderService as any,
      txReceiptStatusService as any,
      firebaseNotificationService as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads exhausted EVM tx orders from the service window', async () => {
    exhaustedOrderService.findPendingSince.mockResolvedValue([]);

    await service.poll();

    expect(exhaustedOrderService.findPendingSince).toHaveBeenCalledWith(
      swapProvider.EVMTX,
      expect.any(Date),
    );
    expect(swapOrderService.findByTxHash).not.toHaveBeenCalled();
  });

  it('keeps exhausted order when the swap order cannot be loaded', async () => {
    const exhausted = createExhaustedOrder();
    exhaustedOrderService.findPendingSince.mockResolvedValue([exhausted]);
    swapOrderService.findByTxHash.mockResolvedValue({
      ok: true,
      data: null,
    });

    await service.poll();

    expect(txReceiptStatusService.getStatus).not.toHaveBeenCalled();
    expect(exhaustedOrderService.deleteById).not.toHaveBeenCalled();
  });

  it('keeps exhausted order while receipt status is still unresolved', async () => {
    const exhausted = createExhaustedOrder();
    const swapOrder = createSwapOrder();
    exhaustedOrderService.findPendingSince.mockResolvedValue([exhausted]);
    swapOrderService.findByTxHash.mockResolvedValue({
      ok: true,
      data: swapOrder,
    });
    txReceiptStatusService.getStatus.mockResolvedValue(null);

    await service.poll();

    expect(txReceiptStatusService.getStatus).toHaveBeenCalledWith(
      swapOrder.fromChain,
      exhausted.txHash,
    );
    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
    expect(exhaustedOrderService.deleteById).not.toHaveBeenCalled();
  });

  it('updates, notifies, and removes resolved exhausted EVM tx order', async () => {
    const exhausted = createExhaustedOrder();
    const swapOrder = createSwapOrder();
    exhaustedOrderService.findPendingSince.mockResolvedValue([exhausted]);
    swapOrderService.findByTxHash.mockResolvedValue({
      ok: true,
      data: swapOrder,
    });
    txReceiptStatusService.getStatus.mockResolvedValue(
      SwapOrderStatus.COMPLETED,
    );
    swapOrderService.updateOrderByHash.mockResolvedValue(swapOrder);

    await service.poll();

    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: exhausted.txHash,
      orderStatus: SwapOrderStatus.COMPLETED,
    });
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledWith(
      swapOrder.deviceFcmToken,
      {
        title: 'Order completed: 10 USDC',
        body: 'From 0x12.....7890',
        data: { network: 'ETH', txHash: '0xhash' },
      },
    );
    expect(exhaustedOrderService.deleteById).toHaveBeenCalledWith(
      exhausted._id.toString(),
    );
  });
});
