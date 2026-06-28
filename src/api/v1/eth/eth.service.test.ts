import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EthService } from './eth.service';
import { ProviderService } from '../provider/provider.service';
import { UniSwapService } from './uniSwap/eth.uniswap.service';
import { EthTestnetSwapService } from './eth.testnet.service';
import { ChainEnum } from '../common/enums/chain.enum';

// Mock all blockchain helper functions
jest.mock('../common/helpers/blockchainUtilityMethods', () => ({
  getTransactionCount: jest.fn().mockResolvedValue(10),
  getFeeData: jest.fn().mockResolvedValue({ maxFeePerGas: 100n, gasPrice: 50n }),
  getNetwork: jest.fn().mockResolvedValue({ chainId: 1n }),
  getEstimateGas: jest.fn().mockResolvedValue(21000n),
  getNativeCurrencyBalance: jest.fn().mockResolvedValue(1000000000000000000n),
  broadcastTransactionToNetwork: jest.fn(),
}));

jest.mock('../common/helpers/contractUtilityMethod', () => ({
  getPool: jest.fn().mockResolvedValue('0xPoolAddress'),
  getPoolContractFee: jest.fn().mockResolvedValue(3000n),
  quoteExactInputSingle: jest.fn().mockResolvedValue({ amountOut: 100n }),
  getErc20ContractInfo: jest.fn().mockResolvedValue({
    name: 'USD Coin', symbol: 'USDC', decimals: 6, balance: 1000000n,
  }),
}));

const mockProviderInstance = {
  estimateGas: jest.fn().mockResolvedValue(21000n),
  broadcastTransaction: jest.fn().mockResolvedValue({ hash: '0xTxHash' }),
};

const mockContract = { interface: { encodeFunctionData: jest.fn().mockReturnValue('0xencodedData') } };

const mockProviderService = {
  getProvider: jest.fn().mockReturnValue(mockProviderInstance),
  getContract: jest.fn().mockReturnValue(mockContract),
};

const mockUniSwapService = {
  getQuote: jest.fn().mockResolvedValue({ amountOut: '100', price: '1.0' }),
  buildSwapTx: jest.fn().mockResolvedValue({ to: '0xRouter', data: '0xswap', value: 0n }),
};

describe('EthService', () => {
  let service: EthService;

  beforeEach(async () => {
    process.env.POOL_FACTORY_CONTRACT_ADDRESS = '0xFactory';
    process.env.QUOTER_CONTRACT_ADDRESS = '0xQuoter';
    process.env.SWAP_ROUTER_ADDRESS = '0xRouter';
    process.env.WETH_ADDRESS = '0xWETH';
    process.env.USDT_ADDRESS = '0xUSDT';
    jest.clearAllMocks();
    mockProviderService.getProvider.mockReturnValue(mockProviderInstance);
    mockProviderService.getContract.mockReturnValue(mockContract);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EthService,
        { provide: ProviderService, useValue: mockProviderService },
        { provide: UniSwapService, useValue: mockUniSwapService },
        { provide: EthTestnetSwapService, useValue: { getQuote: jest.fn(), prepareSwapTransaction: jest.fn() } },
      ],
    }).compile();

    service = module.get<EthService>(EthService);
  });

  afterEach(() => {
    ['POOL_FACTORY_CONTRACT_ADDRESS', 'QUOTER_CONTRACT_ADDRESS', 'SWAP_ROUTER_ADDRESS',
     'WETH_ADDRESS', 'USDT_ADDRESS', 'ENVIRONMENT'].forEach(k => delete process.env[k]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBalance', () => {
    it('returns native ETH balance for wallet address', async () => {
      const result = await service.getBalance({ walletAddress: '0xWallet' });
      expect(result).toBe(1000000000000000000n);
    });
  });

  describe('getWalletAddressInfo', () => {
    it('returns transactionCount and gasFeeData', async () => {
      const result = await service.getWalletAddressInfo({ walletAddress: '0xWallet' });
      expect(result).toHaveProperty('transactionCount', 10);
      expect(result).toHaveProperty('gasFeeData');
    });
  });

  describe('prepareTransaction', () => {
    it('returns full transaction with nonce, gasLimit, chainId', async () => {
      const result = await service.prepareTransaction({
        walletAddress: '0xWallet',
        unsignedTx: { to: '0xTo', data: '0xdata', value: 0n } as any,
      });
      expect(result).toHaveProperty('nonce', 10);
      expect(result).toHaveProperty('gasLimit', 21000n);
      expect(result).toHaveProperty('chainId', 1n);
    });
  });

  describe('estimateGas', () => {
    it('returns estimated gas with 30% buffer', async () => {
      mockProviderInstance.estimateGas.mockResolvedValue(10000n);
      const result = await service.estimateGas('0xTo', '0xFrom', '0xdata');
      expect(result).toBe(13000); // 10000 * 130 / 100
    });

    it('falls back to 100000 for ERC-20 transfer/approve data', async () => {
      mockProviderInstance.estimateGas.mockRejectedValue(new Error('revert'));
      const result = await service.estimateGas('0xTo', '0xFrom', '0xa9059cbb');
      expect(result).toBe(100000);
    });

    it('falls back to 400000 for swap router address', async () => {
      mockProviderInstance.estimateGas.mockRejectedValue(new Error('revert'));
      const result = await service.estimateGas(process.env.SWAP_ROUTER_ADDRESS!, '0xFrom', '0xother');
      expect(result).toBe(400000);
    });
  });

  describe('broadcastTransaction', () => {
    it('broadcasts a single signedTx and returns txHash', async () => {
      mockProviderInstance.broadcastTransaction.mockResolvedValue({ hash: '0xhash1' });
      const result = await service.broadcastTransaction({ signedTx: '0xsigned' } as any);
      expect(result).toEqual({ txHash: '0xhash1', receipt: null });
    });

    it('broadcasts multiple signedTransactions and returns results array', async () => {
      mockProviderInstance.broadcastTransaction
        .mockResolvedValueOnce({ hash: '0xapprove' })
        .mockResolvedValueOnce({ hash: '0xtransfer' });

      const result = await service.broadcastTransaction({
        signedTransactions: ['0xsigned1', '0xsigned2'],
        broadcastChain: 'ETH',
      } as any);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].transactionHash).toBe('0xapprove');
      expect(result.results[0].type).toBe('approve');
    });

    it('throws BadRequestException when no signed transaction provided', async () => {
      await expect(service.broadcastTransaction({} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTokenInfo', () => {
    it('returns token info for valid addresses', async () => {
      const result = await service.getTokenInfo({
        addresses: '0xToken1,0xToken2',
        walletAddress: '0xWallet',
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ symbol: 'USDC', name: 'USD Coin' });
    });

    it('throws BadRequestException for empty address list', async () => {
      await expect(
        service.getTokenInfo({ addresses: '', walletAddress: '0xWallet' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSwapQuote', () => {
    it('delegates to uniSwapService in non-dev environment', async () => {
      process.env.ENVIRONMENT = 'prod';
      const result = await service.getSwapQuote({ tokenIn: {} as any, tokenOut: {} as any, amount: '1' } as any);
      expect(mockUniSwapService.getQuote).toHaveBeenCalled();
      expect(result).toHaveProperty('amountOut');
    });
  });
});
