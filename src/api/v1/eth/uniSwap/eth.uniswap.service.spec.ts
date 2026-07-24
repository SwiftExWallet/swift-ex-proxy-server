import { Logger } from '@nestjs/common';
import { parseUnits } from 'ethers';
import { ResolvedSwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { ChainId } from '../../common/enums/chain.enum';
import { ProviderService } from '../../provider/provider.service';
import { UniSwapService } from './eth.uniswap.service';
import { ProviderErrorCode } from '../../common/utils/provider-error.util';

const mockProvider = {
  getFeeData: jest.fn(),
  getTransactionCount: jest.fn(),
  getBalance: jest.fn(),
  estimateGas: jest.fn(),
};
const mockContractFactory = jest.fn();
const mockEncodeFunctionData = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');

  return {
    ...actual,
    JsonRpcProvider: jest.fn().mockImplementation(() => mockProvider),
    Contract: jest
      .fn()
      .mockImplementation((...args) => mockContractFactory(...args)),
    Interface: jest.fn().mockImplementation(() => ({
      encodeFunctionData: mockEncodeFunctionData,
    })),
  };
});

describe('UniSwapService', () => {
  const originalEnv = process.env;
  const providerService = {
    getRpcUrl: jest.fn(),
  };

  let service: UniSwapService;

  const wethAddress = '0x0000000000000000000000000000000000000004';
  const routerAddress = '0x0000000000000000000000000000000000000003';
  const daiAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const recipient = '0x1234567890123456789012345678901234567890';

  const createQuoteDto = (
    overrides: Partial<ResolvedSwapQuoteDto> = {},
  ): ResolvedSwapQuoteDto =>
    ({
      tokenIn: {
        address: daiAddress,
        symbol: 'DAI',
        chainId: ChainId.ETH,
        decimals: '18',
      },
      tokenOut: {
        address: usdcAddress,
        symbol: 'USDC',
        chainId: ChainId.ETH,
        decimals: '6',
      },
      amount: '1',
      recipient,
      ...overrides,
    }) as ResolvedSwapQuoteDto;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      QUOTER_CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000001',
      SINGLE_QUOTER_CONTRACT_ADDRESS:
        '0x0000000000000000000000000000000000000002',
      SWAP_ROUTER_ADDRESS: routerAddress,
      WETH_ADDRESS: wethAddress,
      TX_DEADLINE_SEC: '600',
      UNISWAP_SLIPPAGE: '50',
    };

    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    providerService.getRpcUrl.mockReturnValue('http://localhost:8545');
    mockEncodeFunctionData.mockImplementation((functionName: string) => {
      return `encoded:${functionName}`;
    });

    service = new UniSwapService(providerService as unknown as ProviderService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(providerService.getRpcUrl).toHaveBeenCalledTimes(1);
  });

  it('returns a WETH unwrap quote when swapping WETH to native ETH', async () => {
    const dto = createQuoteDto({
      tokenIn: {
        address: wethAddress,
        symbol: 'WETH',
        chainId: ChainId.ETH,
        decimals: '18',
      },
      tokenOut: {
        address: 'ETH',
        symbol: 'ETH',
        chainId: ChainId.ETH,
        decimals: '18',
      },
      amount: '2',
    });

    await expect(service.getQuote(dto)).resolves.toEqual({
      inputAmount: '2',
      inputToken: 'WETH',
      outputAmount: '2',
      outputToken: 'ETH',
      pricePerToken: '1',
      fee: '0',
      isMultiHop: false,
      path: undefined,
      isWethUnwrap: true,
    });
    expect(mockContractFactory).not.toHaveBeenCalled();
  });

  it('returns a single-hop quote when the Uniswap quoter succeeds', async () => {
    const quotedAmountOut = parseUnits('200', 6);
    const singleHopContract = {
      quoteExactInputSingle: {
        staticCall: jest.fn().mockResolvedValue(quotedAmountOut),
      },
    };
    mockContractFactory.mockReturnValueOnce(singleHopContract);
    mockProvider.getFeeData.mockResolvedValue({
      maxFeePerGas: parseUnits('10', 'gwei'),
    });

    await expect(service.getQuote(createQuoteDto())).resolves.toEqual({
      inputAmount: '1',
      inputToken: 'DAI',
      outputAmount: '200.0',
      outputToken: 'USDC',
      pricePerToken: '200',
      fee: '500',
      isMultiHop: false,
      path: undefined,
      networkFee: 0.0015,
    });
    expect(
      singleHopContract.quoteExactInputSingle.staticCall,
    ).toHaveBeenCalledWith(
      daiAddress,
      usdcAddress,
      500,
      parseUnits('1', 18),
      0,
    );
    expect(mockProvider.getFeeData).toHaveBeenCalledTimes(1);
  });

  it('throws bad request when quote lookup fails', async () => {
    const singleHopContract = {
      quoteExactInputSingle: {
        staticCall: jest.fn().mockRejectedValue(new Error('single hop failed')),
      },
    };
    const multiHopContract = {
      quoteExactInput: {
        staticCall: jest.fn().mockRejectedValue(new Error('multi hop failed')),
      },
    };
    mockContractFactory
      .mockReturnValueOnce(singleHopContract)
      .mockReturnValueOnce(multiHopContract);

    await expect(service.getQuote(createQuoteDto())).rejects.toMatchObject({
      response: {
        code: ProviderErrorCode.RouteNotFound,
        message: 'No provider route was found for this request.',
      },
    });
    expect(
      singleHopContract.quoteExactInputSingle.staticCall,
    ).toHaveBeenCalledTimes(3);
    expect(multiHopContract.quoteExactInput.staticCall).toHaveBeenCalledTimes(
      5,
    );
  });

  it('builds a native ETH swap transaction from the quoted route', async () => {
    jest.spyOn(service, 'getQuote').mockResolvedValue({
      inputAmount: '1',
      inputToken: 'ETH',
      outputAmount: '200',
      outputToken: 'USDC',
      pricePerToken: '200',
      fee: '500',
      isMultiHop: false,
    } as any);
    mockProvider.getTransactionCount.mockResolvedValue(7);
    mockProvider.getFeeData.mockResolvedValue({
      maxFeePerGas: parseUnits('10', 'gwei'),
      maxPriorityFeePerGas: parseUnits('1', 'gwei'),
    });
    mockProvider.getBalance.mockResolvedValue(parseUnits('2', 18));
    mockProvider.estimateGas.mockResolvedValue(180000n);

    const txs = await service.buildSwapTx(
      createQuoteDto({
        tokenIn: {
          address: 'ETH',
          symbol: 'ETH',
          chainId: ChainId.ETH,
          decimals: '18',
        },
      }),
      50,
    );

    expect(txs).toEqual([
      {
        to: routerAddress,
        from: recipient,
        data: 'encoded:exactInputSingle',
        value: parseUnits('1', 18),
        chainId: 1,
        nonce: 7,
        type: 2,
        maxFeePerGas: parseUnits('10', 'gwei'),
        maxPriorityFeePerGas: parseUnits('1', 'gwei'),
        gasLimit: 198000n,
      },
    ]);
    expect(mockEncodeFunctionData).toHaveBeenCalledWith('exactInputSingle', [
      expect.objectContaining({
        tokenIn: wethAddress,
        tokenOut: usdcAddress,
        fee: '500',
        recipient,
        amountIn: parseUnits('1', 18),
      }),
    ]);
  });

  it('builds an exact-amount ERC20 approval when allowance is too low', async () => {
    jest.spyOn(service, 'getQuote').mockResolvedValue({
      inputAmount: '1',
      inputToken: 'DAI',
      outputAmount: '200',
      outputToken: 'USDC',
      pricePerToken: '200',
      fee: '500',
      isMultiHop: false,
    } as any);
    mockProvider.getTransactionCount.mockResolvedValue(3);
    mockProvider.getFeeData.mockResolvedValue({
      maxFeePerGas: parseUnits('10', 'gwei'),
      maxPriorityFeePerGas: parseUnits('1', 'gwei'),
    });
    mockProvider.getBalance.mockResolvedValue(parseUnits('1', 18));
    mockProvider.estimateGas
      .mockResolvedValueOnce(50000n)
      .mockResolvedValueOnce(180000n);

    const tokenContract = {
      balanceOf: jest.fn().mockResolvedValue(parseUnits('2', 18)),
      allowance: jest.fn().mockResolvedValue(0n),
      interface: {
        encodeFunctionData: jest.fn().mockReturnValue('encoded:approve'),
      },
    };
    mockContractFactory.mockReturnValueOnce(tokenContract);

    const txs = await service.buildSwapTx(createQuoteDto(), 50);

    expect(tokenContract.balanceOf).toHaveBeenCalledWith(recipient);
    expect(tokenContract.allowance).toHaveBeenCalledWith(
      recipient,
      routerAddress,
    );
    expect(tokenContract.interface.encodeFunctionData).toHaveBeenCalledWith(
      'approve',
      [routerAddress, parseUnits('1', 18)],
    );
    expect(txs).toEqual([
      {
        to: daiAddress,
        from: recipient,
        data: 'encoded:approve',
        chainId: 1,
        nonce: 3,
        type: 2,
        maxFeePerGas: parseUnits('10', 'gwei'),
        maxPriorityFeePerGas: parseUnits('1', 'gwei'),
        gasLimit: 55000n,
      },
      {
        to: routerAddress,
        from: recipient,
        data: 'encoded:exactInputSingle',
        chainId: 1,
        nonce: 4,
        type: 2,
        maxFeePerGas: parseUnits('10', 'gwei'),
        maxPriorityFeePerGas: parseUnits('1', 'gwei'),
        gasLimit: 198000n,
      },
    ]);
  });
});
