const mockContract = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');

  return {
    ...actual,
    Contract: mockContract,
  };
});

import { BadRequestException } from '@nestjs/common';
import { parseUnits } from 'ethers';
import { ResolvedSwapQuoteDto } from '../../../common/dto/swapQuote.dto';
import { CHAIN_CONFIGS } from '../constants/quoter.chain.config';
import { SupportedChain } from '../dto/quoter.dto';
import { SwapService } from './swap.service';
import { ProviderErrorCode } from '../../../common/utils/provider-error.util';

describe('SwapService', () => {
  const wallet = '0x3333333333333333333333333333333333333333';
  const tokenInAddress = '0x1111111111111111111111111111111111111111';
  const tokenOutAddress = '0x2222222222222222222222222222222222222222';
  const chainConfig = CHAIN_CONFIGS[SupportedChain.ETH];

  const provider = {
    getFeeData: jest.fn(),
    estimateGas: jest.fn(),
    getTransactionCount: jest.fn(),
    getBalance: jest.fn(),
  };
  const providerService = {
    getProvider: jest.fn(),
  };
  const quoterStaticCall = jest.fn();
  const erc20BalanceOf = jest.fn();
  const erc20Allowance = jest.fn();
  const erc20EncodeFunctionData = jest.fn();

  let service: SwapService;

  const makeDto = (
    overrides: Partial<ResolvedSwapQuoteDto> = {},
  ): ResolvedSwapQuoteDto =>
    ({
      tokenIn: {
        address: tokenInAddress,
        symbol: 'DAI',
        decimals: '18',
        chainId: 'ETH',
      },
      tokenOut: {
        address: tokenOutAddress,
        symbol: 'USDC',
        decimals: '6',
        chainId: 'ETH',
      },
      amount: '1',
      recipient: wallet,
      ...overrides,
    }) as unknown as ResolvedSwapQuoteDto;

  beforeEach(() => {
    jest.clearAllMocks();
    providerService.getProvider.mockReturnValue(provider);
    provider.getFeeData.mockResolvedValue({
      maxFeePerGas: parseUnits('2', 'gwei'),
      maxPriorityFeePerGas: parseUnits('1', 'gwei'),
    });
    provider.estimateGas.mockResolvedValue(100000n);
    provider.getTransactionCount.mockResolvedValue(7);
    provider.getBalance.mockResolvedValue(parseUnits('10', 18));
    erc20BalanceOf.mockResolvedValue(parseUnits('10', 18));
    erc20Allowance.mockResolvedValue(parseUnits('10', 18));
    erc20EncodeFunctionData.mockReturnValue('0xapprove');
    mockContract.mockImplementation((address: string) => {
      if (address === chainConfig.uniswapV3QuoterV2) {
        return {
          quoteExactInputSingle: {
            staticCall: quoterStaticCall,
          },
        };
      }

      return {
        balanceOf: erc20BalanceOf,
        allowance: erc20Allowance,
        interface: {
          encodeFunctionData: erc20EncodeFunctionData,
        },
      };
    });

    service = new SwapService(providerService as any);
    jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
  });

  it('returns a 1:1 quote for wrapped native token unwraps', async () => {
    const dto = makeDto({
      tokenIn: {
        address: chainConfig.wrappedNative,
        symbol: 'WETH',
        decimals: '18',
        chainId: 'ETH',
      } as any,
      tokenOut: {
        address: 'ETH',
        symbol: 'ETH',
        decimals: '18',
        chainId: 'ETH',
      } as any,
    });

    await expect(service.getQuote(dto)).resolves.toEqual({
      inputAmount: '1',
      inputToken: 'WETH',
      outputAmount: '1',
      outputToken: 'ETH',
      pricePerToken: '1',
      fee: '0',
      isMultiHop: false,
      isWethUnwrap: true,
      minimumReceived: '1',
      networkFee: 0.0003,
    });
    expect(mockContract).not.toHaveBeenCalled();
  });

  it('skips failed fee tiers and returns the first successful quote', async () => {
    quoterStaticCall
      .mockRejectedValueOnce(new Error('fee unavailable'))
      .mockResolvedValueOnce([parseUnits('2000', 6), 0n, 0, 120000n]);

    await expect(service.getQuote(makeDto())).resolves.toEqual({
      inputAmount: '1',
      inputToken: 'DAI',
      outputAmount: '2000.0',
      outputToken: 'USDC',
      pricePerToken: '2000',
      fee: '3000',
      isMultiHop: false,
      minimumReceived: '1980.0',
      networkFee: 0.000288,
    });
    expect(quoterStaticCall).toHaveBeenCalledTimes(2);
    expect(quoterStaticCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fee: 500 }),
    );
    expect(quoterStaticCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fee: 3000 }),
    );
  });

  it('throws BadRequestException when no fee tier returns a route', async () => {
    quoterStaticCall.mockRejectedValue(new Error('no pool'));

    await expect(service.getQuote(makeDto())).rejects.toMatchObject({
      response: {
        code: ProviderErrorCode.RouteNotFound,
        message: 'No provider route was found for this request.',
      },
    });
  });

  it('builds one router transaction for native token input', async () => {
    jest.spyOn(service, 'getQuote').mockResolvedValue({
      inputAmount: '1',
      inputToken: 'ETH',
      outputAmount: '2000.0',
      outputToken: 'USDC',
      pricePerToken: '2000',
      fee: '3000',
    });
    provider.estimateGas.mockResolvedValue(100000n);
    const dto = makeDto({
      tokenIn: {
        address: 'ETH',
        symbol: 'ETH',
        decimals: '18',
        chainId: 'ETH',
      } as any,
    });

    const txs = await service.buildSwapTx(dto);

    expect(txs).toHaveLength(1);
    expect(txs[0]).toEqual(
      expect.objectContaining({
        to: chainConfig.swapRouter,
        from: wallet,
        value: parseUnits('1', 18),
        nonce: 7,
        chainId: chainConfig.chainId,
        type: 2,
        gasLimit: 115000n,
      }),
    );
    expect(txs[0].data).toEqual(expect.stringMatching(/^0x/));
  });

  it('builds approval and swap transactions when ERC-20 allowance is too low', async () => {
    jest.spyOn(service, 'getQuote').mockResolvedValue({
      inputAmount: '1',
      inputToken: 'DAI',
      outputAmount: '2000.0',
      outputToken: 'USDC',
      pricePerToken: '2000',
      fee: '3000',
    });
    erc20Allowance.mockResolvedValue(0n);
    provider.estimateGas
      .mockResolvedValueOnce(50000n)
      .mockResolvedValueOnce(200000n);

    const txs = await service.buildSwapTx(makeDto());

    expect(txs).toHaveLength(2);
    expect(txs[0]).toEqual(
      expect.objectContaining({
        to: tokenInAddress,
        from: wallet,
        data: '0xapprove',
        nonce: 7,
        gasLimit: 57500n,
      }),
    );
    expect(txs[1]).toEqual(
      expect.objectContaining({
        to: chainConfig.swapRouter,
        from: wallet,
        nonce: 8,
        gasLimit: 230000n,
      }),
    );
    expect(erc20EncodeFunctionData).toHaveBeenCalledWith('approve', [
      chainConfig.swapRouter,
      parseUnits('1', 18),
    ]);
  });

  it('throws BadRequestException for insufficient ERC-20 balance', async () => {
    jest.spyOn(service, 'getQuote').mockResolvedValue({
      inputAmount: '1',
      inputToken: 'DAI',
      outputAmount: '2000.0',
      outputToken: 'USDC',
      pricePerToken: '2000',
      fee: '3000',
    });
    erc20BalanceOf.mockResolvedValue(parseUnits('0.5', 18));

    await expect(service.buildSwapTx(makeDto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
