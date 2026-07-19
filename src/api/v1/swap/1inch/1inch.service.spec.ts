import { Logger } from '@nestjs/common';
import { OrderStatus as SDKOrderStatus } from '@1inch/cross-chain-sdk';
import { SwapOrderStatus } from '../../common/enums/order.enum';
import { swapProvider } from '../../common/enums/chain.enum';
import { InchService } from './1inch.service';

describe('InchService Fusion+ poller', () => {
  const orderHash = '0xorder';
  const secretState = {
    secrets: ['0xsecret0', '0xsecret1'],
    secretHashes: ['0xhash0', '0xhash1'],
    hashLock: {},
    submittedIdx: [],
  };
  const updatedOrder = {
    txHash: orderHash,
    deviceFcmToken: 'fcm-token',
    amountOut: '10',
    toToken: 'USDC',
    walletAddress: '0x1234567890123456789012345678901234567890',
    fromChain: 'ETH',
  };

  let service: InchService;
  let sdk: {
    getOrderStatus: jest.Mock;
    getReadyToAcceptSecretFills: jest.Mock;
    submitSecret: jest.Mock;
  };
  let swapOrderService: {
    updateOrderByHash: jest.Mock;
    findByProviderAndStatusesSince: jest.Mock;
  };
  let redisService: {
    getKey: jest.Mock;
    setKey: jest.Mock;
    delKey: jest.Mock;
  };
  let firebaseNotificationService: {
    sendNotification: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    sdk = {
      getOrderStatus: jest.fn(),
      getReadyToAcceptSecretFills: jest.fn(),
      submitSecret: jest.fn(),
    };
    swapOrderService = {
      updateOrderByHash: jest.fn().mockResolvedValue(updatedOrder),
      findByProviderAndStatusesSince: jest.fn(),
    };
    redisService = {
      getKey: jest.fn().mockResolvedValue(JSON.stringify(secretState)),
      setKey: jest.fn().mockResolvedValue(undefined),
      delKey: jest.fn().mockResolvedValue(undefined),
    };
    firebaseNotificationService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };

    service = new InchService(
      swapOrderService as any,
      redisService as any,
      firebaseNotificationService as any,
    );
    (service as any).sdk = sdk;
  });

  afterEach(() => {
    for (const order of Array.from((service as any).activeSecretPollers.keys())) {
      (service as any).stopSecretRevealPoller(order);
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('submits ready secrets for pending orders and keeps polling', async () => {
    sdk.getOrderStatus.mockResolvedValue({ status: SDKOrderStatus.Pending });
    sdk.getReadyToAcceptSecretFills.mockResolvedValue({ fills: [{ idx: 0 }] });
    sdk.submitSecret.mockResolvedValue(undefined);

    (service as any).startSecretRevealPoller(orderHash);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(sdk.submitSecret).toHaveBeenCalledWith(orderHash, '0xsecret0');
    expect(redisService.setKey).toHaveBeenCalledWith(
      `fusion_secrets:${orderHash}`,
      expect.stringContaining('"submittedIdx":[0]'),
      7200,
    );
    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
    expect((service as any).activeSecretPollers.has(orderHash)).toBe(true);
  });

  it('updates refunding orders without notification and keeps polling', async () => {
    sdk.getOrderStatus.mockResolvedValue({ status: SDKOrderStatus.Refunding });

    (service as any).startSecretRevealPoller(orderHash);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: orderHash,
      orderStatus: SwapOrderStatus.REFUNDING,
    });
    expect(firebaseNotificationService.sendNotification).not.toHaveBeenCalled();
    expect(redisService.delKey).not.toHaveBeenCalled();
    expect((service as any).activeSecretPollers.has(orderHash)).toBe(true);
  });

  it('updates final orders, sends notification, deletes secret state, and stops polling', async () => {
    sdk.getOrderStatus.mockResolvedValue({ status: SDKOrderStatus.Refunded });

    (service as any).startSecretRevealPoller(orderHash);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: orderHash,
      orderStatus: SwapOrderStatus.REFUNDED,
    });
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expect(redisService.delKey).toHaveBeenCalledWith(`fusion_secrets:${orderHash}`);
    expect((service as any).activeSecretPollers.has(orderHash)).toBe(false);
  });

  it('marks the order exhausted after five reschedules on poll failures', async () => {
    sdk.getOrderStatus.mockRejectedValue(new Error('provider unavailable'));

    (service as any).startSecretRevealPoller(orderHash);

    for (let i = 0; i < 6; i += 1) {
      await jest.runOnlyPendingTimersAsync();
    }

    expect(sdk.getOrderStatus).toHaveBeenCalledTimes(6);
    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: orderHash,
      orderStatus: SwapOrderStatus.EXHAUSTED,
    });
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expect((service as any).activeSecretPollers.has(orderHash)).toBe(false);
  });

  it('marks the order exhausted after five reschedules while still pending', async () => {
    sdk.getOrderStatus.mockResolvedValue({ status: SDKOrderStatus.Pending });
    sdk.getReadyToAcceptSecretFills.mockResolvedValue({ fills: [] });

    (service as any).startSecretRevealPoller(orderHash);

    for (let i = 0; i < 6; i += 1) {
      await jest.runOnlyPendingTimersAsync();
    }

    expect(sdk.getOrderStatus).toHaveBeenCalledTimes(6);
    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: orderHash,
      orderStatus: SwapOrderStatus.EXHAUSTED,
    });
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledTimes(1);
    expect((service as any).activeSecretPollers.has(orderHash)).toBe(false);
  });

  it('resumes pending and refunding orders during startup recovery', async () => {
    const pendingOrder = { txHash: '0xpending' };
    const refundingOrder = { txHash: '0xrefunding' };
    swapOrderService.findByProviderAndStatusesSince.mockResolvedValue({
      ok: true,
      data: [pendingOrder, refundingOrder],
    });
    const startPoller = jest
      .spyOn(service as any, 'startSecretRevealPoller')
      .mockImplementation(() => undefined);

    await service.recoverPendingFusionPlusOrders();

    expect(swapOrderService.findByProviderAndStatusesSince).toHaveBeenCalledWith(
      swapProvider.ONEINCH_FUSION_PLUS,
      [SwapOrderStatus.PENDING, SwapOrderStatus.REFUNDING],
      expect.any(Date),
    );
    expect(startPoller).toHaveBeenCalledWith(pendingOrder.txHash);
    expect(startPoller).toHaveBeenCalledWith(refundingOrder.txHash);
  });
});
