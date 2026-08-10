import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BscService } from './bsc.service';
import { ProviderService } from '../provider/provider.service';
import { PancakeSwapService } from './pancake/bsc.pancake.service';
import { TokenMetadataService } from '../common/services/tokenMetadata.service';

jest.mock('../common/helpers/blockchainUtilityMethods', () => ({
  getTransactionCount: jest.fn().mockResolvedValue(7),
  getFeeData: jest.fn().mockResolvedValue({
    maxFeePerGas: 50n,
    maxPriorityFeePerGas: 10n,
    gasPrice: 30n,
  }),
  getNetwork: jest.fn().mockResolvedValue({ chainId: 56n }),
  getEstimateGas: jest.fn().mockResolvedValue(21000n),
  getNativeCurrencyBalance: jest.fn().mockResolvedValue(2000000000000000000n),
  getErc20ContractTokenBalance: jest.fn().mockResolvedValue(5000000n),
  broadcastTransactionToNetwork: jest.fn(),
}));

jest.mock('../common/helpers/contractUtilityMethod', () => ({
  getErc20ContractInfo: jest.fn().mockResolvedValue({
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 18,
    balance: 5000000n,
  }),
}));

const mockProviderInstance = {
  broadcastTransaction: jest.fn().mockResolvedValue({ hash: '0xBscHash' }),
};

const mockRouterContract = {
  getAmountsOut: jest
    .fn()
    .mockResolvedValue([1000000000000000000n, 990000000000000000n]),
};

const mockProviderService = {
  getProvider: jest.fn().mockReturnValue(mockProviderInstance),
  getContract: jest.fn().mockReturnValue(mockRouterContract),
};

const mockPancakeSwapService = {
  getSwapQuote: jest.fn().mockResolvedValue('0.99'),
  createUnsignedSwapTransaction: jest
    .fn()
    .mockResolvedValue({ to: '0xPancake', data: '0xswap' }),
};
const mockTokenMetadataService = {
  normalizeSwapQuote: jest.fn((dto) => Promise.resolve(dto)),
};

describe('BscService', () => {
  let service: BscService;

  beforeEach(async () => {
    process.env.BSC_ROUTER_ADDRESS = '0xBscRouter';
    process.env.BSC_SLIPPAGE = '5';
    process.env.BSC_TRANSACTION_WAIT_TIME_IN_SECONDS = '600';
    process.env.BSC_TRANSACTION_GAS_LIMIT = '300000';
    jest.clearAllMocks();
    mockProviderService.getProvider.mockReturnValue(mockProviderInstance);
    mockProviderService.getContract.mockReturnValue(mockRouterContract);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BscService,
        { provide: ProviderService, useValue: mockProviderService },
        { provide: PancakeSwapService, useValue: mockPancakeSwapService },
        { provide: TokenMetadataService, useValue: mockTokenMetadataService },
      ],
    }).compile();

    service = module.get<BscService>(BscService);
  });

  afterEach(() => {
    [
      'BSC_ROUTER_ADDRESS',
      'BSC_SLIPPAGE',
      'BSC_TRANSACTION_WAIT_TIME_IN_SECONDS',
      'BSC_TRANSACTION_GAS_LIMIT',
      'ENVIRONMENT',
    ].forEach((k) => delete process.env[k]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBalance', () => {
    it('returns native BNB balance', async () => {
      const result = await service.getBalance({ walletAddress: '0xWallet' });
      expect(result).toBe(2000000000000000000n);
    });
  });

  describe('getWalletAddressInfo', () => {
    it('returns transactionCount and gasFeeData', async () => {
      const result = await service.getWalletAddressInfo({
        walletAddress: '0xWallet',
      });
      expect(result.transactionCount).toBe(7);
      expect(result.gasFeeData).toBeDefined();
    });
  });

  describe('getSwapQuote', () => {
    it('uses router.getAmountsOut in non-prod env', async () => {
      process.env.ENVIRONMENT = 'dev';
      const dto = {
        tokenIn: { address: '0xBNB', decimals: 18 },
        tokenOut: { address: '0xUSDT', decimals: 18 },
        amount: '1',
      };
      const result = await service.getSwapQuote(dto as any);
      expect(mockRouterContract.getAmountsOut).toHaveBeenCalled();
      expect(typeof result).toBe('string');
    });

    it('delegates to pancakeSwapService in prod env', async () => {
      process.env.ENVIRONMENT = 'prod';
      const dto = {
        tokenIn: { address: '0xBNB', decimals: 18 },
        tokenOut: { address: '0xUSDT', decimals: 18 },
        amount: '1',
      };
      const result = await service.getSwapQuote(dto as any);
      expect(mockPancakeSwapService.getSwapQuote).toHaveBeenCalled();
      expect(result).toBe('0.99');
    });
  });

  describe('broadcastTransaction', () => {
    it('broadcasts single signedTx and returns txHash', async () => {
      mockProviderInstance.broadcastTransaction.mockResolvedValue({
        hash: '0xhash1',
      });
      const result = await service.broadcastTransaction({
        signedTx: '0xsigned',
      } as any);
      expect(result).toEqual({ txHash: '0xhash1', receipt: null });
    });

    it('broadcasts multiple transactions', async () => {
      mockProviderInstance.broadcastTransaction
        .mockResolvedValueOnce({ hash: '0xapprove' })
        .mockResolvedValueOnce({ hash: '0xtransfer' });

      const result = await service.broadcastTransaction({
        signedTransactions: ['0xsigned1', '0xsigned2'],
      } as any);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('throws BadRequestException when no transaction provided', async () => {
      await expect(service.broadcastTransaction({} as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('prepareTransaction', () => {
    it('returns full transaction object', async () => {
      const result = await service.prepareTransaction({
        walletAddress: '0xWallet',
        unsignedTx: { to: '0xTo', data: '0xdata', value: 0n } as any,
      });
      expect(result).toHaveProperty('nonce', 7);
      expect(result).toHaveProperty('chainId', 56n);
    });
  });

  describe('getTokenInfo', () => {
    it('returns BEP-20 token info', async () => {
      const result = await service.getTokenInfo({
        addresses: '0xToken1',
        walletAddress: '0xWallet',
      });
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('USDT');
    });

    it('throws for empty address list', async () => {
      await expect(
        service.getTokenInfo({ addresses: '', walletAddress: '0xWallet' }),
      ).rejects.toThrow();
    });
  });
});
