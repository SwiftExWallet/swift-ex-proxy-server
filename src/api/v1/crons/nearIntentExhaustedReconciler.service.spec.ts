import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { OneClickService } from '@defuse-protocol/one-click-sdk-typescript';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { NearIntentExhaustedReconcilerService } from './nearIntentExhaustedReconciler.service';

jest.mock('@defuse-protocol/one-click-sdk-typescript', () => ({
  OneClickService: {
    getExecutionStatus: jest.fn(),
  },
}));

describe('NearIntentExhaustedReconcilerService', () => {
  let service: NearIntentExhaustedReconcilerService;
  let exhaustedOrderService: {
    findPendingSince: jest.Mock;
    deleteById: jest.Mock;
  };
  let swapOrderService: {
    updateOrderById: jest.Mock;
  };
  let firebaseNotificationService: {
    sendNotification: jest.Mock;
  };
  const getExecutionStatus = OneClickService.getExecutionStatus as jest.Mock;

  const createExhaustedOrder = (overrides: Record<string, any> = {}) => ({
    _id: new Types.ObjectId('64f000000000000000000010'),
    txHash: 'deposit-address',
    memo: 'memo-1',
    swapOrderId: new Types.ObjectId('64f000000000000000000011'),
    provider: swapProvider.NEARINTENT,
    exhaustedAt: new Date('2026-08-12T00:00:00.000Z'),
    ...overrides,
  });

  const createSwapOrder = (overrides: Record<string, any> = {}) => ({
    txHash: 'deposit-address',
    fromChain: 'NEAR',
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
      updateOrderById: jest.fn(),
    };
    firebaseNotificationService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    getExecutionStatus.mockReset();

    service = new NearIntentExhaustedReconcilerService(
      exhaustedOrderService as any,
      swapOrderService as any,
      firebaseNotificationService as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads exhausted NEAR intent orders from the service window', async () => {
    exhaustedOrderService.findPendingSince.mockResolvedValue([]);

    await service.poll();

    expect(exhaustedOrderService.findPendingSince).toHaveBeenCalledWith(
      swapProvider.NEARINTENT,
      expect.any(Date),
    );
    expect(getExecutionStatus).not.toHaveBeenCalled();
  });

  it('keeps unresolved NEAR intent orders for the next run', async () => {
    const exhausted = createExhaustedOrder();
    exhaustedOrderService.findPendingSince.mockResolvedValue([exhausted]);
    getExecutionStatus.mockResolvedValue({ status: 'PENDING' });

    await service.poll();

    expect(getExecutionStatus).toHaveBeenCalledWith(
      exhausted.txHash,
      exhausted.memo,
    );
    expect(swapOrderService.updateOrderById).not.toHaveBeenCalled();
    expect(exhaustedOrderService.deleteById).not.toHaveBeenCalled();
  });

  it('does not update when swapOrderId is missing', async () => {
    const exhausted = createExhaustedOrder({ swapOrderId: null });
    exhaustedOrderService.findPendingSince.mockResolvedValue([exhausted]);
    getExecutionStatus.mockResolvedValue({ status: 'SUCCESS' });

    await service.poll();

    expect(swapOrderService.updateOrderById).not.toHaveBeenCalled();
    expect(exhaustedOrderService.deleteById).not.toHaveBeenCalled();
  });

  it('updates, notifies, and removes resolved NEAR intent orders by swapOrderId', async () => {
    const exhausted = createExhaustedOrder();
    const swapOrder = createSwapOrder();
    exhaustedOrderService.findPendingSince.mockResolvedValue([exhausted]);
    getExecutionStatus.mockResolvedValue({ status: 'SUCCESS' });
    swapOrderService.updateOrderById.mockResolvedValue(swapOrder);

    await service.poll();

    expect(swapOrderService.updateOrderById).toHaveBeenCalledWith(
      exhausted.swapOrderId.toHexString(),
      SwapOrderStatus.COMPLETED,
    );
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledWith(
      swapOrder.deviceFcmToken,
      {
        title: 'Order completed: 10 USDC',
        body: 'From 0x12.....7890',
        data: { network: 'NEAR', txHash: 'deposit-address' },
      },
    );
    expect(exhaustedOrderService.deleteById).toHaveBeenCalledWith(
      exhausted._id.toString(),
    );
  });
});
