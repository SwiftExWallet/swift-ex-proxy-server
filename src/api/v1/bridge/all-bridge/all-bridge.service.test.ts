import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AllBridgeService } from './all-bridge.service';
import { ProviderService } from '../../provider/provider.service';
import {
  ValidWalletType,
  ValidPayFeeType,
} from '../../common/enums/all-bridge.enum';

// Mock blockchain helpers
jest.mock('../../common/helpers/blockchainUtilityMethods', () => ({
  getTransactionCount: jest.fn().mockResolvedValue(5),
  getNetwork: jest.fn().mockResolvedValue({ chainId: 1n }),
  getFeeData: jest.fn().mockResolvedValue({ maxFeePerGas: 100n }),
  getEstimateGas: jest.fn().mockResolvedValue(21000n),
}));

const mockProvider = { call: jest.fn().mockResolvedValue('0x') };

const mockRpcService = {
  getChainRpcUrl: jest.fn().mockReturnValue('http://rpc.test'),
  getProvider: jest.fn().mockReturnValue(mockProvider),
};

const usdcToken = { symbol: 'USDC', chainSymbol: 'ETH' };
const mockChainDetailsMap = {
  ETH: { tokens: [usdcToken], chainSymbol: 'ETH' },
  BSC: { tokens: [{ symbol: 'USDT', chainSymbol: 'BSC' }], chainSymbol: 'BSC' },
};

const mockSdk = {
  chainDetailsMap: jest.fn().mockResolvedValue(mockChainDetailsMap),
  bridge: {
    checkAllowance: jest.fn(),
    rawTxBuilder: {
      send: jest
        .fn()
        .mockResolvedValue({ to: '0xBridge', data: '0xdata', value: 0n }),
      approve: jest
        .fn()
        .mockResolvedValue({ to: '0xToken', data: '0xapprove', value: 0n }),
    },
  },
  getAmountToBeReceived: jest.fn().mockResolvedValue('95.0'),
  getAmountToBeReceivedAndGasFeeOptions: jest.fn().mockResolvedValue({
    gasFeeOptions: {
      native: { float: '0.001' },
      stablecoin: { float: '0.5' },
    },
  }),
  getAverageTransferTime: jest.fn().mockReturnValue(60000),
};

jest.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: jest.fn().mockImplementation(() => mockSdk),
  Messenger: { ALLBRIDGE: 'ALLBRIDGE' },
  FeePaymentMethod: {
    WITH_NATIVE_CURRENCY: 'native',
    WITH_STABLECOIN: 'stablecoin',
  },
}));

describe('AllBridgeService', () => {
  let service: AllBridgeService;

  beforeEach(async () => {
    process.env.SLIPPAGE_TOLERANCE = '0.5';
    jest.clearAllMocks();
    mockSdk.chainDetailsMap.mockResolvedValue(mockChainDetailsMap);
    mockSdk.bridge.rawTxBuilder.send.mockResolvedValue({
      to: '0xBridge',
      data: '0xdata',
      value: 0n,
    });
    mockSdk.bridge.rawTxBuilder.approve.mockResolvedValue({
      to: '0xToken',
      data: '0xapprove',
      value: 0n,
    });
    mockRpcService.getChainRpcUrl.mockReturnValue('http://rpc.test');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllBridgeService,
        { provide: ProviderService, useValue: mockRpcService },
      ],
    }).compile();

    service = module.get<AllBridgeService>(AllBridgeService);
  });

  afterEach(() => {
    delete process.env.SLIPPAGE_TOLERANCE;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSwapDetails', () => {
    const dto = {
      sourceChain: 'ETH',
      destinationChain: 'BSC',
      sourceToken: 'USDC',
      destinationToken: 'USDT',
      amount: '100',
    };

    it('returns conversionRate, minimumAmountOut and fee', async () => {
      const result = await service.getSwapDetails(dto as any);
      expect(result.minimumAmountOut).toBe('95.0');
      expect(result.conversionRate).toBe((95 / 100).toFixed(12));
      expect(result.fee).toHaveProperty('native');
      expect(result.fee).toHaveProperty('stablecoin');
    });

    it('returns source and destination chain/token passthrough', async () => {
      const result = await service.getSwapDetails(dto as any);
      expect(result.sourceChain).toBe('ETH');
      expect(result.destinationChain).toBe('BSC');
      expect(result.sourceToken).toBe('USDC');
      expect(result.destinationToken).toBe('USDT');
    });

    it('returns slippageTolerance from env', async () => {
      const result = await service.getSwapDetails(dto as any);
      expect(result.slippageTolerance).toBe('0.5');
    });

    it('throws BadRequestException when chain not found', async () => {
      mockSdk.chainDetailsMap.mockResolvedValueOnce({});
      await expect(service.getSwapDetails(dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when token not found', async () => {
      mockSdk.chainDetailsMap.mockResolvedValueOnce({
        ETH: { tokens: [], chainSymbol: 'ETH' },
        BSC: { tokens: [], chainSymbol: 'BSC' },
      });
      await expect(service.getSwapDetails(dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('prepareTransaction', () => {
    const swapDto = {
      fromAddress: '0xFrom',
      toAddress: '0xTo',
      amount: '100',
      sourceToken: 'USDC',
      destinationToken: 'USDT',
      walletType: ValidWalletType.ETH,
      destinationWalletType: ValidWalletType.BSC,
      feePayType: ValidPayFeeType.WITH_NATIVE_CURRENCY,
    };

    it('returns transfer-only transaction when allowance is sufficient', async () => {
      mockSdk.bridge.checkAllowance.mockResolvedValue(true);
      mockProvider.call.mockResolvedValue('0x');

      const result = await service.prepareTransaction(swapDto as any);
      expect(result.needsApproval).toBe(false);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].type).toBe('transfer');
    });

    it('returns approve + transfer when allowance is insufficient', async () => {
      mockSdk.bridge.checkAllowance.mockResolvedValue(false);
      mockProvider.call.mockResolvedValue('0x');

      const result = await service.prepareTransaction(swapDto as any);
      expect(result.needsApproval).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe('approve');
      expect(result.transactions[1].type).toBe('transfer');
    });

    it('throws BadRequestException when token not found', async () => {
      mockSdk.chainDetailsMap.mockResolvedValue({
        ETH: { tokens: [], chainSymbol: 'ETH' },
        BSC: { tokens: [], chainSymbol: 'BSC' },
      });
      await expect(service.prepareTransaction(swapDto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
