jest.mock('@uniswap/smart-order-router', () => ({
  AlphaRouter: jest.fn(),
  SwapType: {
    SWAP_ROUTER_02: 'SWAP_ROUTER_02',
  },
}));

import { BadRequestException } from '@nestjs/common';
import { QuoterService } from './quoter.service';
import { ChainId, swapProvider } from '../../common/enums/chain.enum';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { ProviderErrorCode } from '../../common/utils/provider-error.util';

describe('QuoterService', () => {
  const providerService = {
    getChainRpcUrl: jest.fn(),
  };
  const inchService = {
    getSwapQuote: jest.fn(),
  };
  const swapProviderResolver = {
    resolve: jest.fn(),
  };
  const tokenMetadataService = {
    normalizeSwapQuote: jest.fn(),
  };

  let service: QuoterService;

  const validDto = {
    tokenIn: {
      address: '0x1111111111111111111111111111111111111111',
      symbol: 'ETH',
      decimals: '18',
      chainId: ChainId.ETH,
    },
    tokenOut: {
      address: '0x2222222222222222222222222222222222222222',
      symbol: 'USDC',
      decimals: '6',
      chainId: ChainId.ETH,
    },
    amount: '1',
    recipient: '0x3333333333333333333333333333333333333333',
  } as SwapQuoteDto;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QuoterService(
      providerService as any,
      inchService as any,
      swapProviderResolver as any,
      tokenMetadataService as any,
    );
  });

  it('normalizes and routes Uniswap quote requests through getQuote', async () => {
    const quote = { outputAmount: '100', fee: '3000' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(validDto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: swapProvider.UNISWAP,
      transformed: validDto,
    });
    jest.spyOn(service, 'getQuote').mockResolvedValue(quote as any);

    await expect(service.getQuoteResponse(validDto)).resolves.toEqual({
      success: true,
      provider: swapProvider.UNISWAP,
      data: quote,
    });

    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith(
      validDto,
    );
    expect(swapProviderResolver.resolve).toHaveBeenCalledWith(validDto);
    expect(service.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({ amount: validDto.amount }),
    );
  });

  it('normalizes and routes 1inch quote requests through the Inch service', async () => {
    const quote = { quoteId: 'quote-id' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(validDto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: swapProvider.ONEINCH_FUSION,
      transformed: validDto,
    });
    inchService.getSwapQuote.mockResolvedValue(quote);

    await expect(service.getQuoteResponse(validDto)).resolves.toEqual({
      success: true,
      provider: swapProvider.ONEINCH_FUSION,
      data: quote,
    });

    expect(inchService.getSwapQuote).toHaveBeenCalledWith(
      expect.objectContaining({ amount: validDto.amount }),
    );
  });

  it('throws flattened validation messages for invalid transformed payloads', async () => {
    const invalidDto = {
      ...validDto,
      tokenIn: {
        ...validDto.tokenIn,
        address: 'invalid-address',
        decimals: '',
      },
    };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(validDto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: swapProvider.UNISWAP,
      transformed: invalidDto,
    });
    jest.spyOn(service, 'getQuote').mockResolvedValue({} as any);

    await expect(service.getQuoteResponse(validDto)).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          'Invalid public key format',
          'decimals should not be empty',
        ]),
      },
    });
    expect(service.getQuote).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for unsupported providers', async () => {
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(validDto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: 'UNKNOWN',
      transformed: validDto,
    });

    await expect(service.getQuoteResponse(validDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('normalizes and wraps swap transaction builds', async () => {
    const txs = [{ to: '0x4444444444444444444444444444444444444444' }];
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(validDto);
    jest.spyOn(service, 'buildSwapTx').mockResolvedValue(txs as any);

    await expect(service.buildSwapResponse(validDto)).resolves.toEqual({
      success: true,
      data: txs,
    });

    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith(
      validDto,
    );
    expect(service.buildSwapTx).toHaveBeenCalledWith(validDto);
  });

  it('returns stable provider errors when swap transaction build fails upstream', async () => {
    jest
      .spyOn(service, 'getQuote')
      .mockRejectedValue(new Error('private provider route failure'));

    await expect(service.buildSwapTx(validDto)).rejects.toMatchObject({
      response: {
        code: ProviderErrorCode.RouteNotFound,
        message: 'No provider route was found for this request.',
      },
    });
  });
});
