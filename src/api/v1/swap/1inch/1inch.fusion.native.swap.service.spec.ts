import { FustionNativeService } from './1inch.fusion.native.swap.service';
import {
  decryptFusionSecretState,
  encryptFusionSecretState,
} from '../../common/utils/encryption.util';

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

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FUSION_SECRETS_ENCRYPTION_KEY: encryptionKey,
    };
    redisService = {
      setKey: jest.fn().mockResolvedValue(undefined),
      getKey: jest.fn(),
      delKey: jest.fn(),
    };

    service = new FustionNativeService(
      { get: jest.fn() } as any,
      redisService as any,
      {} as any,
      {} as any,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
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
});
