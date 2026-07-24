import { Logger, NotFoundException } from '@nestjs/common';
import { FustionNativeService } from './1inch.fusion.native.swap.service';
import {
  decryptFusionSecretState,
  encryptFusionSecretState,
} from '../../common/utils/encryption.util';
import { SwapOrderStatus } from '../../common/enums/order.enum';
import { ProviderErrorCode } from '../../common/utils/provider-error.util';

jest.mock('@1inch/cross-chain-sdk', () => ({
  Address: jest.fn(),
  EvmAddress: { fromString: jest.fn() },
  EvmCrossChainOrder: class EvmCrossChainOrder {},
  HashLock: {
    forMultipleFills: jest.fn(),
    forSingleFill: jest.fn(),
    getMerkleLeavesFromSecretHashes: jest.fn(),
    hashSecret: jest.fn(),
  },
  MerkleLeaf: jest.fn(),
  NativeOrdersFactory: { default: jest.fn() },
  OrderStatus: {
    Executed: 'Executed',
    Expired: 'Expired',
    Refunded: 'Refunded',
  },
  PresetEnum: { fast: 'fast' },
  SDK: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@1inch/fusion-sdk', () => ({
  Address: jest.fn(),
  FusionSDK: jest.fn().mockImplementation(() => ({})),
  OrderStatus: {
    Cancelled: 'Cancelled',
    Expired: 'Expired',
    Filled: 'Filled',
  },
}));

describe('FustionNativeService secret state TTL', () => {
  const originalEnv = process.env;
  const encryptionKey = '12345678901234567890123456789012';
  let service: FustionNativeService;
  let redisService: { setKey: jest.Mock; getKey: jest.Mock; delKey: jest.Mock };
  let swapOrderService: {
    updateOrderByHash: jest.Mock;
    findOrderByHashForDeviceWallet: jest.Mock;
  };
  let firebaseNotificationService: { sendNotification: jest.Mock };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FUSION_SECRETS_ENCRYPTION_KEY: encryptionKey,
      PROVIDER_RETRY_MAX_ATTEMPTS: '1',
      PROVIDER_RPC_ALLOWED_HOSTS: 'eth-rpc.example',
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    redisService = {
      setKey: jest.fn().mockResolvedValue(undefined),
      getKey: jest.fn(),
      delKey: jest.fn(),
    };
    swapOrderService = {
      updateOrderByHash: jest.fn().mockResolvedValue({}),
      findOrderByHashForDeviceWallet: jest.fn().mockResolvedValue({
        ok: true,
        data: { txHash: 'order-hash' },
      }),
    };
    firebaseNotificationService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };

    service = new FustionNativeService(
      { get: jest.fn() } as any,
      redisService as any,
      swapOrderService as any,
      firebaseNotificationService as any,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('sets native Fusion secret state with the default TTL', async () => {
    await (service as any).setSecretState('order-hash', {
      secrets: ['0xsecret'],
      secretHashes: ['0xhash'],
      hashLock: {},
      submittedIdx: new Set([0]),
      isCrossChain: true,
    });

    expect(redisService.setKey).toHaveBeenCalledWith(
      'fusion_secrets:order-hash',
      expect.any(String),
      7200,
    );

    const redisValue = redisService.setKey.mock.calls[0][1];
    expect(redisValue).not.toContain('0xsecret');
    expect(decryptFusionSecretState(redisValue) as any).toMatchObject({
      secrets: ['0xsecret'],
      submittedIdx: [0],
      isCrossChain: true,
    });
  });

  it('sets native Fusion secret state with the configured TTL', async () => {
    process.env.FUSION_SECRET_STATE_TTL_SECONDS = '300';

    await (service as any).setSecretState('order-hash', {
      secrets: ['0xsecret'],
      secretHashes: ['0xhash'],
      hashLock: {},
      submittedIdx: new Set(),
      isCrossChain: false,
    });

    expect(redisService.setKey).toHaveBeenCalledWith(
      'fusion_secrets:order-hash',
      expect.any(String),
      300,
    );

    const redisValue = redisService.setKey.mock.calls[0][1];
    expect(redisValue).not.toContain('0xsecret');
    expect(decryptFusionSecretState(redisValue) as any).toMatchObject({
      secrets: ['0xsecret'],
      isCrossChain: false,
    });
  });

  it('reads legacy plaintext native Fusion secret state and rewrites it encrypted', async () => {
    const plaintextSecretState = {
      secrets: ['0xsecret'],
      secretHashes: ['0xhash'],
      hashLock: {},
      submittedIdx: [0],
      isCrossChain: true,
    };
    redisService.getKey.mockResolvedValueOnce(
      JSON.stringify(plaintextSecretState),
    );

    const result = await (service as any).getSecretState('order-hash');

    expect(result.secrets).toEqual(plaintextSecretState.secrets);
    expect(result.submittedIdx).toEqual(new Set([0]));
    expect(redisService.setKey).toHaveBeenCalledWith(
      'fusion_secrets:order-hash',
      expect.any(String),
      7200,
    );

    const redisValue = redisService.setKey.mock.calls[0][1];
    expect(redisValue).not.toContain('0xsecret');
    expect(decryptFusionSecretState(redisValue) as any).toMatchObject(
      plaintextSecretState,
    );
  });

  it('reads encrypted native Fusion secret state without rewriting it', async () => {
    redisService.getKey.mockResolvedValueOnce(
      encryptFusionSecretState({
        secrets: ['0xsecret'],
        secretHashes: ['0xhash'],
        hashLock: {},
        submittedIdx: [0],
        isCrossChain: true,
      }),
    );

    const result = await (service as any).getSecretState('order-hash');

    expect(result.secrets).toEqual(['0xsecret']);
    expect(result.submittedIdx).toEqual(new Set([0]));
    expect(redisService.setKey).not.toHaveBeenCalled();
  });

  it('verifies device and wallet ownership before confirming native Fusion orders', async () => {
    const walletAddress = '0x1234567890123456789012345678901234567890';
    const waitForTransaction = jest
      .fn()
      .mockReturnValue(new Promise(() => undefined));
    jest.spyOn(service, 'getProvider').mockReturnValue({
      waitForTransaction,
    } as any);
    redisService.getKey.mockResolvedValueOnce(
      encryptFusionSecretState({
        secrets: [],
        secretHashes: [],
        hashLock: null,
        submittedIdx: [],
        isCrossChain: false,
      }),
    );

    await expect(
      service.confirmSwapOrder(
        {
          orderHash: 'order-hash',
          txHash: '0xtxhash',
          srcChain: 'ETH',
        } as any,
        'device-id',
        walletAddress,
      ),
    ).resolves.toMatchObject({
      success: true,
      typeTx: 'fusion',
    });

    expect(
      swapOrderService.findOrderByHashForDeviceWallet,
    ).toHaveBeenCalledWith('device-id', 'order-hash', walletAddress);
    expect(redisService.getKey).toHaveBeenCalledWith(
      'fusion_secrets:order-hash',
    );
    expect(waitForTransaction).toHaveBeenCalledWith('0xtxhash', 3);
  });

  it('rejects native Fusion confirmation before Redis/provider work when the order is not owned', async () => {
    const walletAddress = '0x1234567890123456789012345678901234567890';
    const getProvider = jest.spyOn(service, 'getProvider');
    swapOrderService.findOrderByHashForDeviceWallet.mockResolvedValueOnce({
      ok: true,
      data: null,
    });

    await expect(
      service.confirmSwapOrder(
        {
          orderHash: 'order-hash',
          txHash: '0xtxhash',
          srcChain: 'ETH',
        } as any,
        'device-id',
        walletAddress,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(redisService.getKey).not.toHaveBeenCalled();
    expect(getProvider).not.toHaveBeenCalled();
  });

  it('exhausts native Fusion monitoring after the configured max schedules', async () => {
    process.env.FUSION_NATIVE_SECRET_POLL_MAX_SCHEDULES = '2';
    jest.useFakeTimers();
    redisService.getKey.mockResolvedValue(
      encryptFusionSecretState({
        secrets: [],
        secretHashes: [],
        hashLock: null,
        submittedIdx: [],
        isCrossChain: false,
      }),
    );
    const fusionSdk = {
      getOrderStatus: jest.fn().mockResolvedValue({ status: 'Pending' }),
    };
    (service as any).fusionSdkMap.set(1, fusionSdk);

    const loop = (service as any).startSecretSubmissionLoop('order-hash', 1);

    await Promise.resolve();
    await jest.runOnlyPendingTimersAsync();
    await loop;

    expect(fusionSdk.getOrderStatus).toHaveBeenCalledTimes(2);
    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: 'order-hash',
      orderStatus: SwapOrderStatus.EXHAUSTED,
    });
    expect(redisService.delKey).toHaveBeenCalledWith(
      'fusion_secrets:order-hash',
    );
  });

  it('exhausts native Fusion monitoring after the configured provider failure limit', async () => {
    process.env.FUSION_NATIVE_SECRET_POLL_MAX_SCHEDULES = '10';
    process.env.FUSION_NATIVE_SECRET_POLL_MAX_PROVIDER_FAILURES = '2';
    jest.useFakeTimers();
    redisService.getKey.mockResolvedValue(
      encryptFusionSecretState({
        secrets: [],
        secretHashes: [],
        hashLock: null,
        submittedIdx: [],
        isCrossChain: false,
      }),
    );
    const fusionSdk = {
      getOrderStatus: jest.fn().mockRejectedValue(new Error('provider down')),
    };
    (service as any).fusionSdkMap.set(1, fusionSdk);

    const loop = (service as any).startSecretSubmissionLoop('order-hash', 1);

    await Promise.resolve();
    await jest.runOnlyPendingTimersAsync();
    await loop;

    expect(fusionSdk.getOrderStatus).toHaveBeenCalledTimes(2);
    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: 'order-hash',
      orderStatus: SwapOrderStatus.EXHAUSTED,
    });
    expect(redisService.delKey).toHaveBeenCalledWith(
      'fusion_secrets:order-hash',
    );
  });

  it('resets native Fusion provider failure count after a successful poll', async () => {
    process.env.FUSION_NATIVE_SECRET_POLL_MAX_SCHEDULES = '4';
    process.env.FUSION_NATIVE_SECRET_POLL_MAX_PROVIDER_FAILURES = '2';
    jest.useFakeTimers();
    redisService.getKey.mockResolvedValue(
      encryptFusionSecretState({
        secrets: [],
        secretHashes: [],
        hashLock: null,
        submittedIdx: [],
        isCrossChain: false,
      }),
    );
    const fusionSdk = {
      getOrderStatus: jest
        .fn()
        .mockRejectedValueOnce(new Error('provider down once'))
        .mockResolvedValueOnce({ status: 'Pending' })
        .mockRejectedValueOnce(new Error('provider down twice'))
        .mockRejectedValueOnce(new Error('provider down third time')),
    };
    (service as any).fusionSdkMap.set(1, fusionSdk);

    const loop = (service as any).startSecretSubmissionLoop('order-hash', 1);

    await Promise.resolve();
    await jest.runOnlyPendingTimersAsync();
    await jest.runOnlyPendingTimersAsync();
    await jest.runOnlyPendingTimersAsync();
    await loop;

    expect(fusionSdk.getOrderStatus).toHaveBeenCalledTimes(4);
    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: 'order-hash',
      orderStatus: SwapOrderStatus.EXHAUSTED,
    });
  });

  it('returns stable provider errors when native Fusion quote creation fails', async () => {
    const fusionSdk = {
      getQuote: jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: 'internal 1inch validation payload',
        },
      }),
    };
    (service as any).fusionSdkMap.set(1, fusionSdk);

    await expect(
      service.createSwapOrder({
        amount: '1',
        srcChain: 'ETH',
        dstChain: 'ETH',
        srcTokenAddress: '0xtoken-in',
        dstTokenAddress: '0xtoken-out',
        walletAddress: '0x1234567890123456789012345678901234567890',
      } as any),
    ).rejects.toMatchObject({
      response: {
        code: ProviderErrorCode.BadResponse,
        message: 'Provider rejected the request.',
      },
    });
  });

  it('rejects unallowlisted native Fusion RPC URLs', () => {
    const rejectedService = new FustionNativeService(
      {
        get: jest.fn((key: string) =>
          key === 'PROVIDER_RPC_ETH_1' ? 'https://evil.example/rpc' : undefined,
        ),
      } as any,
      redisService as any,
      swapOrderService as any,
      firebaseNotificationService as any,
    );

    expect(() => rejectedService.getProvider(1)).toThrow(
      'PROVIDER_RPC_ETH_1 host is not allowlisted',
    );
  });
});
