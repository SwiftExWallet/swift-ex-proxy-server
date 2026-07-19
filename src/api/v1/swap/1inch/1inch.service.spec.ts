import { Logger } from '@nestjs/common';
import { OrderStatus as SDKOrderStatus } from '@1inch/cross-chain-sdk';
import { SwapOrderStatus } from '../../common/enums/order.enum';
import { swapProvider } from '../../common/enums/chain.enum';
import { InchService } from './1inch.service';
import {
  decryptFusionSecretState,
  encryptFusionSecretState,
} from '../../common/utils/encryption.util';
import { ProviderErrorCode } from '../../common/utils/provider-error.util';

describe('InchService Fusion+ poller', () => {
  const originalEnv = process.env;
  const encryptionKey = '12345678901234567890123456789012';
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
    process.env = {
      ...originalEnv,
      FUSION_SECRETS_ENCRYPTION_KEY: encryptionKey,
      QUOTER_BASE: 'https://api.1inch.dev/swap/v6.0',
      FUSION_PLUS_QUOTER_BASE: 'https://api.1inch.dev/fusion-plus/quoter',
      INCH_RELAYER_BASE: 'https://api.1inch.dev/fusion/relayer',
      FUSION_PLUS_RELAYER_BASE: 'https://api.1inch.dev/fusion-plus/relayer',
      INCH_ORDER_BASE: 'https://api.1inch.dev/fusion/orders',
      FUSION_PLUS_ORDER_BASE: 'https://api.1inch.dev/fusion-plus/orders/',
    };
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
      getKey: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(encryptFusionSecretState(secretState)),
        ),
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
    for (const order of Array.from(
      (service as any).activeSecretPollers.keys(),
    )) {
      (service as any).stopSecretRevealPoller(order);
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it('submits ready secrets for pending orders and keeps polling', async () => {
    sdk.getOrderStatus.mockResolvedValue({ status: SDKOrderStatus.Pending });
    sdk.getReadyToAcceptSecretFills.mockResolvedValue({ fills: [{ idx: 0 }] });
    sdk.submitSecret.mockResolvedValue(undefined);

    (service as any).startSecretRevealPoller(orderHash);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(sdk.submitSecret).toHaveBeenCalledWith(orderHash, '0xsecret0');
    const setCall = redisService.setKey.mock.calls.find(
      ([key]) => key === `fusion_secrets:${orderHash}`,
    );
    expect(setCall).toBeDefined();
    expect(setCall![1]).not.toContain('0xsecret0');
    expect(decryptFusionSecretState(setCall![1]) as any).toMatchObject({
      secrets: secretState.secrets,
      submittedIdx: [0],
    });
    expect(setCall![2]).toBe(7200);
    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
    expect((service as any).activeSecretPollers.has(orderHash)).toBe(true);
  });

  it('rewrites legacy plaintext secret states as encrypted Redis envelopes', async () => {
    redisService.getKey.mockResolvedValueOnce(JSON.stringify(secretState));

    const result = await (service as any).getSecretState(orderHash);

    expect(result.secrets).toEqual(secretState.secrets);
    expect(result.submittedIdx).toEqual(new Set(secretState.submittedIdx));
    expect(redisService.setKey).toHaveBeenCalledWith(
      `fusion_secrets:${orderHash}`,
      expect.any(String),
      7200,
    );

    const redisValue = redisService.setKey.mock.calls[0][1];
    expect(redisValue).not.toContain('0xsecret0');
    expect(decryptFusionSecretState(redisValue) as any).toMatchObject(
      secretState,
    );
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
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledTimes(
      1,
    );
    expect(redisService.delKey).toHaveBeenCalledWith(
      `fusion_secrets:${orderHash}`,
    );
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
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledTimes(
      1,
    );
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
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledTimes(
      1,
    );
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

    expect(
      swapOrderService.findByProviderAndStatusesSince,
    ).toHaveBeenCalledWith(
      swapProvider.ONEINCH_FUSION_PLUS,
      [SwapOrderStatus.PENDING, SwapOrderStatus.REFUNDING],
      expect.any(Date),
    );
    expect(startPoller).toHaveBeenCalledWith(pendingOrder.txHash);
    expect(startPoller).toHaveBeenCalledWith(refundingOrder.txHash);
  });

  it('returns stable provider errors for quote failures', async () => {
    jest.spyOn(service as any, 'providerGet').mockRejectedValue({
      response: {
        status: 429,
        data: {
          description: 'quota exhausted for private 1inch route',
        },
      },
    });

    const error = await service
      .getSwapQuote({
        tokenIn: '0xtoken-in',
        tokenOut: '0xtoken-out',
        amount: '1',
        walletAddress: '0xwallet',
        chain: 'ETH',
      } as any)
      .catch((err) => err);

    expect(error).toMatchObject({
      response: {
        code: ProviderErrorCode.RateLimited,
        message: 'Provider rate limit exceeded. Please try again later.',
      },
    });
    expect(JSON.stringify(error.response)).not.toContain('private 1inch route');
  });

  it('rejects redirected 1inch base URLs before provider calls', async () => {
    const providerGet = jest.spyOn(service as any, 'providerGet');
    process.env.QUOTER_BASE = 'https://evil.example/swap/v6.0';

    await expect(
      service.getSwapQuote({
        tokenIn: '0xtoken-in',
        tokenOut: '0xtoken-out',
        amount: '1',
        walletAddress: '0xwallet',
        chain: 'ETH',
      } as any),
    ).rejects.toThrow('QUOTER_BASE host is not allowlisted');
    expect(providerGet).not.toHaveBeenCalled();
  });
});
