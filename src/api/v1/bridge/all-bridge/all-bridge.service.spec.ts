import { BadRequestException, Logger } from '@nestjs/common';
import {
  AllbridgeCoreSdk,
  FeePaymentMethod,
  Messenger,
} from '@allbridge/bridge-core-sdk';
import { ChainEnum } from '../../common/enums/chain.enum';
import {
  ValidPayFeeType,
  ValidWalletType,
} from '../../common/enums/all-bridge.enum';
import {
  getEstimateGas,
  getFeeData,
  getNetwork,
  getTransactionCount,
} from '../../common/helpers/blockchainUtilityMethods';
import { ProviderService } from '../../provider/provider.service';
import { AllBridgeService } from './all-bridge.service';

const mockSdk = {
  chainDetailsMap: jest.fn(),
  getAmountToBeReceived: jest.fn(),
  getAmountToBeReceivedAndGasFeeOptions: jest.fn(),
  getAverageTransferTime: jest.fn(),
  bridge: {
    checkAllowance: jest.fn(),
    rawTxBuilder: {
      send: jest.fn(),
      approve: jest.fn(),
    },
  },
};

jest.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: jest.fn().mockImplementation(() => mockSdk),
  FeePaymentMethod: {
    WITH_NATIVE_CURRENCY: 'WITH_NATIVE_CURRENCY',
    WITH_STABLECOIN: 'WITH_STABLECOIN',
  },
  Messenger: {
    ALLBRIDGE: 'ALLBRIDGE',
  },
}));

jest.mock('../../common/helpers/blockchainUtilityMethods', () => ({
  getEstimateGas: jest.fn(),
  getFeeData: jest.fn(),
  getNetwork: jest.fn(),
  getTransactionCount: jest.fn(),
}));

describe('AllBridgeService', () => {
  const originalEnv = process.env;
  const fromAddress = '0x1234567890123456789012345678901234567890';
  const toAddress = '0x9999999999999999999999999999999999999999';

  const ethToken = {
    symbol: 'USDC',
    chainSymbol: ValidWalletType.ETH,
  };
  const bscToken = {
    symbol: 'USDT',
    chainSymbol: ValidWalletType.BSC,
  };
  const chainDetails = {
    [ValidWalletType.ETH]: {
      chainSymbol: 'ETH',
      tokens: [ethToken, { symbol: 'USDT' }, { symbol: 'USDe' }],
    },
    [ValidWalletType.BSC]: {
      chainSymbol: 'BNB',
      tokens: [bscToken, { symbol: 'USDC' }],
    },
  };

  let service: AllBridgeService;
  let provider: {
    call: jest.Mock;
  };
  let rpcService: {
    getChainRpcUrl: jest.Mock;
    getProvider: jest.Mock;
  };

  const swapDto = (overrides: Record<string, any> = {}) =>
    ({
      fromAddress,
      toAddress,
      amount: '10',
      sourceToken: 'USDC',
      destinationToken: 'USDT',
      walletType: ValidWalletType.ETH,
      destinationWalletType: ValidWalletType.BSC,
      feePayType: ValidPayFeeType.WITH_NATIVE_CURRENCY,
      ...overrides,
    }) as any;

  const quoteDto = (overrides: Record<string, any> = {}) =>
    ({
      amount: '10',
      sourceChain: ValidWalletType.ETH,
      sourceToken: 'USDC',
      destinationChain: ValidWalletType.BSC,
      destinationToken: 'USDT',
      ...overrides,
    }) as any;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SLIPPAGE_TOLERANCE: '0.5',
    };

    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();

    provider = {
      call: jest.fn().mockResolvedValue('0x'),
    };
    rpcService = {
      getChainRpcUrl: jest.fn((chain: ChainEnum) => `${chain}-rpc`),
      getProvider: jest.fn().mockReturnValue(provider),
    };

    mockSdk.chainDetailsMap.mockResolvedValue(chainDetails);
    mockSdk.bridge.checkAllowance.mockResolvedValue(true);
    mockSdk.bridge.rawTxBuilder.send.mockResolvedValue({
      to: '0xtransfer',
      data: '0xtransferdata',
      value: 0n,
    });
    mockSdk.bridge.rawTxBuilder.approve.mockResolvedValue({
      to: '0xapprove',
      data: '0xapprovedata',
      value: 0n,
    });
    mockSdk.getAmountToBeReceived.mockResolvedValue('9.5');
    mockSdk.getAmountToBeReceivedAndGasFeeOptions.mockResolvedValue({
      gasFeeOptions: {
        native: { float: '0.001' },
        stablecoin: { float: '0.2' },
      },
    });
    mockSdk.getAverageTransferTime.mockReturnValue(120000);
    (getTransactionCount as jest.Mock).mockResolvedValue(7);
    (getEstimateGas as jest.Mock).mockResolvedValue(21000n);
    (getFeeData as jest.Mock).mockResolvedValue({
      maxFeePerGas: 100n,
      maxPriorityFeePerGas: 10n,
      gasPrice: 50n,
    });
    (getNetwork as jest.Mock).mockResolvedValue({
      chainId: 1n,
      name: 'mainnet',
    });

    service = new AllBridgeService(rpcService as unknown as ProviderService);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('constructs the Allbridge SDK with configured RPC URLs', () => {
    expect(AllbridgeCoreSdk).toHaveBeenCalledWith({
      ETH: 'eth-rpc',
      BSC: 'bsc-rpc',
      POL: 'pol-rpc',
      ARB: 'arb-rpc',
      BAS: 'base-rpc',
      AVA: 'avax-rpc',
      OPT: 'opt-rpc',
    });
    expect(rpcService.getChainRpcUrl).toHaveBeenCalledWith(ChainEnum.ETH);
    expect(rpcService.getChainRpcUrl).toHaveBeenCalledWith(ChainEnum.BSC);
    expect(rpcService.getChainRpcUrl).toHaveBeenCalledWith(ChainEnum.BASE);
  });

  it('throws bad request when source or destination token is missing', async () => {
    await expect(
      service.prepareTransaction(
        swapDto({
          sourceToken: 'DAI',
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(mockSdk.bridge.checkAllowance).not.toHaveBeenCalled();
    expect(mockSdk.bridge.rawTxBuilder.send).not.toHaveBeenCalled();
  });

  it('returns only a transfer transaction when allowance is sufficient', async () => {
    const result = await service.prepareTransaction(swapDto());

    expect(mockSdk.bridge.checkAllowance).toHaveBeenCalledWith({
      token: ethToken,
      owner: fromAddress,
      amount: '10',
    });
    expect(mockSdk.bridge.rawTxBuilder.send).toHaveBeenCalledWith({
      amount: '10',
      fromAccountAddress: fromAddress,
      toAccountAddress: toAddress,
      sourceToken: ethToken,
      destinationToken: bscToken,
      messenger: Messenger.ALLBRIDGE,
      gasFeePaymentMethod: FeePaymentMethod.WITH_NATIVE_CURRENCY,
    });
    expect(provider.call).toHaveBeenCalledWith({
      from: fromAddress,
      to: '0xtransfer',
      data: '0xtransferdata',
      value: 0n,
    });
    expect(result).toEqual({
      needsApproval: false,
      transactions: [
        {
          transaction: {
            to: '0xtransfer',
            data: '0xtransferdata',
            value: 0n,
          },
          txMeta: {
            nonce: 7,
            gasLimit: 21000n,
            feeData: {
              maxFeePerGas: 125n,
              maxPriorityFeePerGas: 12n,
              gasPrice: 62n,
            },
            network: {
              chainId: 1n,
              name: 'mainnet',
            },
          },
          type: 'transfer',
        },
      ],
    });
  });

  it('returns approve and transfer transactions when approval is required', async () => {
    mockSdk.bridge.checkAllowance.mockResolvedValue(false);

    const result = await service.prepareTransaction(swapDto());

    expect(mockSdk.bridge.rawTxBuilder.approve).toHaveBeenCalledWith({
      token: ethToken,
      owner: fromAddress,
    });
    expect(getTransactionCount).toHaveBeenCalledWith(provider, fromAddress);
    expect(getEstimateGas).toHaveBeenCalledWith(provider, fromAddress, {
      to: '0xapprove',
      data: '0xapprovedata',
      value: 0n,
    });
    expect(result).toEqual({
      needsApproval: true,
      transactions: [
        {
          transaction: {
            to: '0xapprove',
            data: '0xapprovedata',
            value: 0n,
          },
          txMeta: {
            nonce: 7,
            gasLimit: 21000n,
            feeData: {
              maxFeePerGas: 125n,
              maxPriorityFeePerGas: 12n,
              gasPrice: 62n,
            },
            network: {
              chainId: 1n,
              name: 'mainnet',
            },
          },
          type: 'approve',
        },
        {
          transaction: {
            to: '0xtransfer',
            data: '0xtransferdata',
            value: 0n,
          },
          txMeta: {
            nonce: 8,
            gasLimit: 350000n,
            feeData: {
              maxFeePerGas: 100n,
              maxPriorityFeePerGas: 10n,
              gasPrice: 50n,
            },
            network: {
              chainId: 1n,
              name: 'mainnet',
            },
          },
          type: 'transfer',
        },
      ],
    });
  });

  it('uses stablecoin fee payment when requested', async () => {
    await service.prepareTransaction(
      swapDto({
        feePayType: ValidPayFeeType.WITH_STABLECOIN,
      }),
    );

    expect(mockSdk.bridge.rawTxBuilder.send).toHaveBeenCalledWith(
      expect.objectContaining({
        gasFeePaymentMethod: FeePaymentMethod.WITH_STABLECOIN,
      }),
    );
  });

  it('wraps simulation failures as bad request exceptions', async () => {
    provider.call.mockRejectedValue({
      reason: 'simulation reverted',
    });

    await expect(service.prepareTransaction(swapDto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns swap details with conversion, fee, timing, and route metadata', async () => {
    const details = await service.getSwapDetails(quoteDto());

    expect(mockSdk.getAmountToBeReceived).toHaveBeenCalledWith(
      '10',
      ethToken,
      bscToken,
      Messenger.ALLBRIDGE,
    );
    expect(mockSdk.getAmountToBeReceivedAndGasFeeOptions).toHaveBeenCalledWith(
      '10',
      ethToken,
      bscToken,
      Messenger.ALLBRIDGE,
    );
    expect(mockSdk.getAverageTransferTime).toHaveBeenCalledWith(
      ethToken,
      bscToken,
      Messenger.ALLBRIDGE,
    );
    expect(details).toEqual({
      conversionRate: '0.950000000000',
      minimumAmountOut: '9.5',
      slippageTolerance: '0.5',
      fee: {
        native: {
          amount: '0.001',
          symbol: 'ETH',
        },
        stablecoin: {
          amount: '0.2',
          symbol: 'USDC',
        },
      },
      completionTime: 120000,
      sourceChain: ValidWalletType.ETH,
      sourceToken: 'USDC',
      destinationChain: ValidWalletType.BSC,
      destinationToken: 'USDT',
    });
  });

  it('throws bad request when quote chain details are missing', async () => {
    mockSdk.chainDetailsMap.mockResolvedValue({
      [ValidWalletType.ETH]: chainDetails[ValidWalletType.ETH],
    });

    await expect(service.getSwapDetails(quoteDto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws bad request when quote token details are missing', async () => {
    await expect(
      service.getSwapDetails(
        quoteDto({
          sourceToken: 'DAI',
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
