import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus as SDKOrderStatus } from '@1inch/cross-chain-sdk';
import { SwapOrderStatus } from '../../common/enums/order.enum';
import {
  SupportedWalletChain,
  swapProvider,
} from '../../common/enums/chain.enum';
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
    deviceId: 'device-1',
    deviceFcmToken: 'fcm-token',
    amountOut: '10',
    toToken: 'USDC',
    walletAddress: '0x1234567890123456789012345678901234567890',
    fromChain: 'ETH',
  };
  const verifiedWallet = (address = updatedOrder.walletAddress) =>
    ({
      addresses: new Map([
        [SupportedWalletChain.eth, address],
        [SupportedWalletChain.multi, address],
      ]),
    }) as any;

  let service: InchService;
  let sdk: {
    getOrderStatus: jest.Mock;
    getReadyToAcceptSecretFills: jest.Mock;
    submitSecret: jest.Mock;
  };
  let swapOrderService: {
    updateOrderByHash: jest.Mock;
    findByTxHash: jest.Mock;
    findOrderByHashForVerifiedWallet: jest.Mock;
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
  let exhaustedOrderService: {
    upsertByTxHash: jest.Mock;
  };
  let portfolioService: {
    refreshPortfolio: jest.Mock;
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
      findByTxHash: jest.fn().mockResolvedValue({
        ok: true,
        data: updatedOrder,
      }),
      findOrderByHashForVerifiedWallet: jest.fn().mockResolvedValue({
        ok: true,
        data: updatedOrder,
      }),
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
    exhaustedOrderService = {
      upsertByTxHash: jest.fn().mockResolvedValue(undefined),
    };
    portfolioService = {
      refreshPortfolio: jest.fn().mockResolvedValue(undefined),
    };

    service = new InchService(
      swapOrderService as any,
      redisService as any,
      firebaseNotificationService as any,
      exhaustedOrderService as any,
      portfolioService as any,
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
    expect(swapOrderService.findByTxHash).toHaveBeenCalledWith(orderHash);
    expect(portfolioService.refreshPortfolio).toHaveBeenCalledWith(
      updatedOrder.deviceId,
      updatedOrder.walletAddress,
      [updatedOrder.fromChain],
    );
    expect((service as any).activeSecretPollers.has(orderHash)).toBe(true);
  });

  it('skips source portfolio refresh when the order has no device id', async () => {
    swapOrderService.findByTxHash.mockResolvedValueOnce({
      ok: true,
      data: { ...updatedOrder, deviceId: null },
    });

    await (service as any).refreshSourcePortfolio(orderHash);

    expect(portfolioService.refreshPortfolio).not.toHaveBeenCalled();
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

  it('skips custom notifications when there is no device token', async () => {
    await expect(
      service.fireCustomNotification(undefined, {
        title: 'Swap',
        body: 'Updated',
      } as any),
    ).resolves.toBe(false);

    expect(firebaseNotificationService.sendNotification).not.toHaveBeenCalled();
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

  it('verifies verified-wallet order ownership before refreshing order status', async () => {
    const providerGet = jest
      .spyOn(service as any, 'providerGet')
      .mockResolvedValue({ status: 'pending' });

    await expect(
      service.orderStatus(
        {
          orderHash,
          chain: 'ETH',
          swapProvider: swapProvider.ONEINCH_FUSION,
        } as any,
        verifiedWallet(),
      ),
    ).resolves.toEqual({ status: 'pending' });

    expect(
      swapOrderService.findOrderByHashForVerifiedWallet,
    ).toHaveBeenCalledWith(
      orderHash,
      updatedOrder.walletAddress,
      verifiedWallet(),
    );
    expect(providerGet).toHaveBeenCalledTimes(1);
    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: orderHash,
      orderStatus: SwapOrderStatus.PENDING,
    });
  });

  it('rejects order status refresh before provider calls when the order is not owned', async () => {
    const providerGet = jest.spyOn(service as any, 'providerGet');
    swapOrderService.findOrderByHashForVerifiedWallet.mockResolvedValueOnce({
      ok: true,
      data: null,
    });

    await expect(
      service.orderStatus(
        {
          orderHash,
          chain: 'ETH',
          swapProvider: swapProvider.ONEINCH_FUSION,
        } as any,
        verifiedWallet(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(providerGet).not.toHaveBeenCalled();
    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
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

  it('uses the request wallet multi address for 1inch quotes', async () => {
    const providerGet = jest
      .spyOn(service as any, 'providerGet')
      .mockResolvedValue({ quoteId: 'quote-id' });
    const legacyWalletAddress = '0x1111111111111111111111111111111111111111';
    const requestWallet = {
      multi: '0x9999999999999999999999999999999999999999',
      xlm: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    };

    await expect(
      service.getSwapQuote(
        {
          tokenIn: '0x2222222222222222222222222222222222222222',
          tokenOut: '0x3333333333333333333333333333333333333333',
          amount: '1',
          walletAddress: legacyWalletAddress,
          chain: 'ETH',
        } as any,
        requestWallet,
      ),
    ).resolves.toEqual({ quoteId: 'quote-id' });

    expect(providerGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({ walletAddress: requestWallet.multi }),
      }),
    );
  });

  it('uses the request wallet multi address for Fusion+ quotes', async () => {
    const providerGet = jest
      .spyOn(service as any, 'providerGet')
      .mockResolvedValue({ quoteId: 'fusion-plus-quote-id' });
    const legacyWalletAddress = '0x1111111111111111111111111111111111111111';
    const requestWallet = {
      multi: '0x9999999999999999999999999999999999999999',
      xlm: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    };

    await expect(
      service.getFusionPlusSwapQuote(
        {
          srcChain: 'ETH',
          dstChain: 'BSC',
          srcTokenAddress: '0x2222222222222222222222222222222222222222',
          dstTokenAddress: '0x3333333333333333333333333333333333333333',
          amount: '1',
          walletAddress: legacyWalletAddress,
        } as any,
        requestWallet,
      ),
    ).resolves.toEqual({ quoteId: 'fusion-plus-quote-id' });

    expect(providerGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({ walletAddress: requestWallet.multi }),
      }),
    );
  });

  it('rejects Fusion submit when order maker does not match the verified wallet', async () => {
    const providerPost = jest.spyOn(service as any, 'providerPost');

    await expect(
      service.submitFusionOrder(
        { _id: 'device-id' },
        {
          order: { maker: '0x9999999999999999999999999999999999999999' },
          signature: '0xsignature',
          extension: '0xextension',
          quoteId: 'quote-id',
          chain: 'ETH',
        } as any,
        verifiedWallet('0x1234567890123456789012345678901234567890'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(providerPost).not.toHaveBeenCalled();
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
