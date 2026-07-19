import { BadRequestException, Logger } from '@nestjs/common';
import { Fetcher } from '@pancakeswap/sdk';
import { ethers } from 'ethers';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { ChainId } from '../../common/enums/chain.enum';
import { PancakeSwapService } from './bsc.pancake.service';

const mockProvider = {
  getFeeData: jest.fn(),
  getTransactionCount: jest.fn(),
  getBalance: jest.fn(),
  estimateGas: jest.fn(),
  broadcastTransaction: jest.fn(),
};
const mockContractFactory = jest.fn();
const mockEncodeFunctionData = jest.fn();
const mockTradeState = {
  outputAmount: '2',
  price: '2',
  minimumAmountOut: '990000000000000000',
};

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');

  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn().mockImplementation(() => mockProvider),
      Contract: jest
        .fn()
        .mockImplementation((...args) => mockContractFactory(...args)),
      Interface: jest.fn().mockImplementation(() => ({
        encodeFunctionData: mockEncodeFunctionData,
      })),
    },
  };
});

jest.mock('viem', () => {
  const viemClient = {};

  return {
    createPublicClient: jest.fn().mockReturnValue(viemClient),
    http: jest.fn((url: string) => ({ url })),
  };
});

jest.mock('viem/chains', () => ({
  bsc: { id: 56, name: 'BSC' },
}));

jest.mock('@pancakeswap/sdk', () => {
  class MockToken {
    constructor(
      public chainId: number,
      public address: string,
      public decimals: number,
      public symbol: string,
      public name?: string,
    ) {}
  }

  class MockRoute {
    path: MockToken[];

    constructor(pairs: any[], fromToken: MockToken, toToken: MockToken) {
      this.path =
        pairs.length > 1
          ? [fromToken, pairs[0].tokenB, toToken]
          : [fromToken, toToken];
    }
  }

  class MockTrade {
    route: MockRoute;
    outputAmount = {
      toExact: jest.fn(() => mockTradeState.outputAmount),
    };
    executionPrice = {
      invert: jest.fn(() => ({
        toSignificant: jest.fn(() => mockTradeState.price),
      })),
    };
    minimumAmountOut = jest.fn(() => ({
      quotient: BigInt(mockTradeState.minimumAmountOut),
    }));

    constructor(route: MockRoute) {
      this.route = route;
    }
  }

  class MockPercent {
    constructor(
      public numerator: number,
      public denominator: string,
    ) {}
  }

  return {
    ChainId: { BSC: 56 },
    Token: MockToken,
    Fetcher: {
      fetchPairData: jest.fn((tokenA: MockToken, tokenB: MockToken) =>
        Promise.resolve({ tokenA, tokenB }),
      ),
    },
    Route: MockRoute,
    Trade: MockTrade,
    TradeType: { EXACT_INPUT: 'EXACT_INPUT' },
    CurrencyAmount: {
      fromRawAmount: jest.fn((token: MockToken, rawAmount: string) => ({
        token,
        quotient: BigInt(rawAmount),
      })),
    },
    Percent: MockPercent,
  };
});

describe('PancakeSwapService', () => {
  const originalEnv = process.env;
  const tokenInAddress = '0x1111111111111111111111111111111111111111';
  const tokenOutAddress = '0x2222222222222222222222222222222222222222';
  const recipient = '0x1234567890123456789012345678901234567890';

  let service: PancakeSwapService;

  const createToken = (
    address: string,
    symbol: string,
    decimals = 18,
  ): any => ({
    chainId: 56,
    address,
    decimals,
    symbol,
    name: symbol,
  });

  const createQuoteDto = (
    overrides: Partial<SwapQuoteDto> = {},
  ): SwapQuoteDto =>
    ({
      tokenIn: {
        address: tokenInAddress,
        symbol: 'CAKE',
        chainId: ChainId.BSC,
        decimals: '18',
      },
      tokenOut: {
        address: tokenOutAddress,
        symbol: 'USDT',
        chainId: ChainId.BSC,
        decimals: '18',
      },
      amount: '1',
      recipient,
      slippage: 1,
      ...overrides,
    }) as SwapQuoteDto;

  const mockTokenLookup = () => {
    const wbnb = (service as any).WBNB;
    const tokenIn = createToken(tokenInAddress, 'CAKE');
    const tokenOut = createToken(tokenOutAddress, 'USDT');
    const busd = createToken((service as any).BUSD_ADDRESS, 'BUSD');
    const usdt = createToken((service as any).USDT_ADDRESS, 'USDT');

    jest
      .spyOn(service as any, 'getToken')
      .mockImplementation((address: string) => {
        const normalized = address.toLowerCase();
        if (normalized === wbnb.address.toLowerCase()) {
          return Promise.resolve(wbnb);
        }
        if (normalized === tokenInAddress.toLowerCase()) {
          return Promise.resolve(tokenIn);
        }
        if (normalized === tokenOutAddress.toLowerCase()) {
          return Promise.resolve(tokenOut);
        }
        if (normalized === (service as any).BUSD_ADDRESS.toLowerCase()) {
          return Promise.resolve(busd);
        }
        if (normalized === (service as any).USDT_ADDRESS.toLowerCase()) {
          return Promise.resolve(usdt);
        }
        return Promise.resolve(createToken(address, 'TOKEN'));
      });

    return { wbnb, tokenIn, tokenOut, busd, usdt };
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PROVIDER_RPC_BSC: 'https://bsc-rpc',
    };

    jest.clearAllMocks();
    Object.values(mockProvider).forEach((mockFn) => mockFn.mockReset());
    mockContractFactory.mockReset();
    mockEncodeFunctionData.mockReset();
    (Fetcher.fetchPairData as jest.Mock).mockReset();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    (Fetcher.fetchPairData as jest.Mock).mockImplementation(
      (tokenA: any, tokenB: any) => Promise.resolve({ tokenA, tokenB }),
    );
    mockTradeState.outputAmount = '2';
    mockTradeState.price = '2';
    mockTradeState.minimumAmountOut = '990000000000000000';
    mockProvider.getFeeData.mockResolvedValue({
      gasPrice: ethers.parseUnits('5', 'gwei'),
    });
    mockProvider.getTransactionCount.mockResolvedValue(7);
    mockProvider.getBalance.mockResolvedValue(ethers.parseUnits('10', 18));
    mockProvider.estimateGas.mockResolvedValue(250000n);
    mockEncodeFunctionData.mockImplementation(
      (functionName: string) => `encoded:${functionName}`,
    );

    service = new PancakeSwapService();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(ethers.JsonRpcProvider).toHaveBeenCalledWith('https://bsc-rpc');
  });

  it('returns a direct-route swap quote', async () => {
    mockTokenLookup();

    await expect(service.getSwapQuote(createQuoteDto())).resolves.toEqual({
      inputAmount: '1',
      inputToken: 'CAKE',
      outputAmount: '2',
      outputToken: 'USDT',
      pricePerToken: '2',
      fee: '3000',
      route: 'direct',
      path: 'CAKE -> USDT',
      networkFee: 0.00075,
    });
    expect(Fetcher.fetchPairData).toHaveBeenCalledTimes(1);
  });

  it('falls back to a WBNB multi-hop quote when the direct route fails', async () => {
    const { wbnb } = mockTokenLookup();
    (Fetcher.fetchPairData as jest.Mock)
      .mockRejectedValueOnce(new Error('direct unavailable'))
      .mockImplementation((tokenA: any, tokenB: any) =>
        Promise.resolve({ tokenA, tokenB }),
      );

    await expect(service.getSwapQuote(createQuoteDto())).resolves.toEqual(
      expect.objectContaining({
        route: 'multi-hop-wbnb',
        path: `CAKE -> ${wbnb.symbol} -> USDT`,
      }),
    );
    expect(Fetcher.fetchPairData).toHaveBeenCalledTimes(3);
  });

  it('throws bad request when no liquidity route is found', async () => {
    mockTokenLookup();
    (Fetcher.fetchPairData as jest.Mock).mockRejectedValue(
      new Error('no pair'),
    );

    await expect(service.getSwapQuote(createQuoteDto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects transaction preparation without a recipient', async () => {
    mockTokenLookup();

    await expect(
      service.createUnsignedSwapTransaction(
        createQuoteDto({ recipient: undefined as any }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('builds a native BNB to token swap transaction', async () => {
    const { wbnb } = mockTokenLookup();
    mockProvider.estimateGas.mockResolvedValue(250000n);

    const txs = await service.createUnsignedSwapTransaction(
      createQuoteDto({
        tokenIn: {
          address: 'BNB',
          symbol: 'BNB',
          chainId: ChainId.BSC,
          decimals: '18',
        },
      }),
    );

    expect(mockEncodeFunctionData).toHaveBeenCalledWith(
      'swapExactETHForTokensSupportingFeeOnTransferTokens',
      [
        mockTradeState.minimumAmountOut,
        [wbnb.address, tokenOutAddress],
        recipient,
        expect.any(Number),
      ],
    );
    expect(txs).toEqual([
      {
        to: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
        from: recipient,
        value: ethers.parseUnits('1', 18).toString(),
        data: 'encoded:swapExactETHForTokensSupportingFeeOnTransferTokens',
        chainId: 56,
        nonce: 7,
        gasPrice: ethers.parseUnits('5', 'gwei').toString(),
        gasLimit: '300000',
      },
    ]);
  });

  it('builds token swap transactions with approval when allowance is too low', async () => {
    mockTokenLookup();
    mockContractFactory
      .mockReturnValueOnce({
        balanceOf: jest.fn().mockResolvedValue(ethers.parseUnits('2', 18)),
      })
      .mockReturnValueOnce({
        allowance: jest.fn().mockResolvedValue(0n),
      });
    mockProvider.estimateGas
      .mockResolvedValueOnce(60000n)
      .mockResolvedValueOnce(250000n);

    const txs = await service.createUnsignedSwapTransaction(createQuoteDto());

    expect(mockEncodeFunctionData).toHaveBeenCalledWith('approve', [
      '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      ethers.MaxUint256,
    ]);
    expect(mockEncodeFunctionData).toHaveBeenCalledWith(
      'swapExactTokensForTokensSupportingFeeOnTransferTokens',
      [
        ethers.parseUnits('1', 18).toString(),
        mockTradeState.minimumAmountOut,
        [tokenInAddress, tokenOutAddress],
        recipient,
        expect.any(Number),
      ],
    );
    expect(txs).toEqual([
      {
        to: tokenInAddress,
        from: recipient,
        value: '0',
        data: 'encoded:approve',
        chainId: 56,
        nonce: 7,
        gasPrice: ethers.parseUnits('5', 'gwei').toString(),
        gasLimit: '72000',
      },
      {
        to: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
        from: recipient,
        value: '0',
        data: 'encoded:swapExactTokensForTokensSupportingFeeOnTransferTokens',
        chainId: 56,
        nonce: 8,
        gasPrice: ethers.parseUnits('5', 'gwei').toString(),
        gasLimit: '300000',
      },
    ]);
  });

  it('skips approval when token allowance is sufficient', async () => {
    mockTokenLookup();
    mockContractFactory
      .mockReturnValueOnce({
        balanceOf: jest.fn().mockResolvedValue(ethers.parseUnits('2', 18)),
      })
      .mockReturnValueOnce({
        allowance: jest.fn().mockResolvedValue(ethers.parseUnits('2', 18)),
      });

    const txs = await service.createUnsignedSwapTransaction(createQuoteDto());

    expect(txs).toHaveLength(1);
    expect(txs[0]).toEqual(
      expect.objectContaining({
        to: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
        nonce: 7,
        data: 'encoded:swapExactTokensForTokensSupportingFeeOnTransferTokens',
      }),
    );
    expect(mockEncodeFunctionData).not.toHaveBeenCalledWith(
      'approve',
      expect.anything(),
    );
  });

  it('rejects native swaps when BNB balance is insufficient', async () => {
    mockTokenLookup();
    mockProvider.getBalance.mockResolvedValue(1n);

    await expect(
      service.createUnsignedSwapTransaction(
        createQuoteDto({
          tokenIn: {
            address: 'BNB',
            symbol: 'BNB',
            chainId: ChainId.BSC,
            decimals: '18',
          },
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects token swaps when token balance is insufficient', async () => {
    mockTokenLookup();
    mockContractFactory.mockReturnValueOnce({
      balanceOf: jest.fn().mockResolvedValue(1n),
    });

    await expect(
      service.createUnsignedSwapTransaction(createQuoteDto()),
    ).rejects.toThrow(BadRequestException);
  });

  it('broadcasts signed transactions and maps transaction responses', async () => {
    const receipt = { status: 1 };
    mockProvider.broadcastTransaction.mockResolvedValue({
      hash: '0xhash',
      from: recipient,
      to: tokenOutAddress,
      nonce: 1,
      gasLimit: 21000n,
      gasPrice: ethers.parseUnits('5', 'gwei'),
      data: '0xdata',
      value: 0n,
      chainId: 56n,
      wait: jest.fn().mockResolvedValue(receipt),
    });

    await expect(service.broadcastTransaction(['0xsigned'])).resolves.toEqual([
      {
        txResponse: {
          hash: '0xhash',
          from: recipient,
          to: tokenOutAddress,
          nonce: 1,
          gasLimit: '21000',
          gasPrice: ethers.parseUnits('5', 'gwei').toString(),
          data: '0xdata',
          value: '0',
          chainId: '56',
        },
        receipt,
      },
    ]);
  });

  it('returns total estimated swap gas', async () => {
    jest.spyOn(service, 'createUnsignedSwapTransaction').mockResolvedValue([
      { to: '0xone', value: '0', data: '0xdata1', from: recipient },
      { to: '0xtwo', value: '0', data: '0xdata2', from: recipient },
    ]);
    mockProvider.estimateGas
      .mockResolvedValueOnce(100n)
      .mockResolvedValueOnce(200n);

    await expect(service.estimateSwapGas(createQuoteDto())).resolves.toBe(
      '300',
    );
  });

  it('returns fallback gas when estimating prepared transactions fails', async () => {
    jest
      .spyOn(service, 'createUnsignedSwapTransaction')
      .mockRejectedValue(new Error('prepare failed'));

    await expect(service.estimateSwapGas(createQuoteDto())).resolves.toBe(
      '300000',
    );
  });
});
