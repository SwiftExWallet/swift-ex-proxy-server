import { BadRequestException } from '@nestjs/common';
import { QuoterService } from './quoter.service';
import { ChainId, swapProvider } from '../common/enums/chain.enum';
import {
  ResolvedSwapQuoteDto,
  SwapQuoteDto,
} from '../common/dto/swapQuote.dto';

describe('QuoterService', () => {
  const inchService = {
    getSwapQuote: jest.fn(),
    getFusionPlusSwapQuote: jest.fn(),
  };
  const swapProviderResolver = {
    resolve: jest.fn(),
  };
  const tokenMetadataService = {
    normalizeSwapQuote: jest.fn(),
  };
  const uniswapService = {
    getSwapQuote: jest.fn(),
  };
  let service: QuoterService;

  const requestDto = {
    tokenIn: {
      address: '0x1111111111111111111111111111111111111111',
      chainId: ChainId.ETH,
    },
    tokenOut: {
      address: '0x2222222222222222222222222222222222222222',
      chainId: ChainId.ETH,
    },
    amount: '1',
    recipient: '0x3333333333333333333333333333333333333333',
  } as SwapQuoteDto;
  const verifiedWallet = {
    addresses: {
      eth: '0x3333333333333333333333333333333333333333',
      multi: '0x9999999999999999999999999999999999999999',
    },
  };

  const resolvedDto = {
    ...requestDto,
    tokenIn: {
      ...requestDto.tokenIn,
      symbol: 'ETH',
      decimals: '18',
    },
    tokenOut: {
      ...requestDto.tokenOut,
      symbol: 'USDC',
      decimals: '6',
    },
  } as ResolvedSwapQuoteDto;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QuoterService(
      inchService as any,
      swapProviderResolver as any,
      tokenMetadataService as any,
      uniswapService as any,
    );
  });

  it('normalizes and routes Uniswap quote requests through the Uniswap service', async () => {
    const quote = { outputAmount: '100', fee: '3000' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(resolvedDto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: swapProvider.UNISWAP,
      transformed: resolvedDto,
    });
    uniswapService.getSwapQuote.mockResolvedValue(quote);

    await expect(service.getQuoteResponse(requestDto)).resolves.toEqual({
      success: true,
      provider: swapProvider.UNISWAP,
      data: quote,
    });

    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith(
      requestDto,
    );
    expect(swapProviderResolver.resolve).toHaveBeenCalledWith(resolvedDto);
    expect(uniswapService.getSwapQuote).toHaveBeenCalledWith(
      expect.objectContaining({ amount: requestDto.amount }),
    );
  });

  it('does not derive the quote recipient from the verified wallet', async () => {
    const quote = { outputAmount: '100', fee: '3000' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(resolvedDto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: swapProvider.UNISWAP,
      transformed: resolvedDto,
    });
    uniswapService.getSwapQuote.mockResolvedValue(quote);

    await expect(service.getQuoteResponse(requestDto)).resolves.toEqual({
      success: true,
      provider: swapProvider.UNISWAP,
      data: quote,
    });

    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith(
      requestDto,
    );
    expect(uniswapService.getSwapQuote).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: requestDto.recipient }),
    );
  });

  it('normalizes and routes 1inch quote requests through the Inch service', async () => {
    const quote = { quoteId: 'quote-id' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(resolvedDto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: swapProvider.ONEINCH_FUSION,
      transformed: resolvedDto,
    });
    inchService.getSwapQuote.mockResolvedValue(quote);

    await expect(
      service.getQuoteResponse(requestDto, verifiedWallet as any),
    ).resolves.toEqual({
      success: true,
      provider: swapProvider.ONEINCH_FUSION,
      data: quote,
    });

    expect(inchService.getSwapQuote).toHaveBeenCalledWith({
      chain: 'ETH',
      tokenIn: requestDto.tokenIn.address,
      tokenOut: requestDto.tokenOut.address,
      walletAddress: verifiedWallet.addresses.multi,
      amount: '1000000000000000000',
    });
  });

  it('routes gasless chain 138 quotes through the Inch service', async () => {
    const quote = { quoteId: 'quote-id' };
    const chain138Dto = {
      ...resolvedDto,
      tokenIn: {
        ...resolvedDto.tokenIn,
        chainId: 138,
        decimals: '6',
      },
      tokenOut: {
        ...resolvedDto.tokenOut,
        chainId: 138,
        decimals: '6',
      },
    };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(chain138Dto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: swapProvider.ONEINCH_FUSION,
      transformed: chain138Dto,
    });
    inchService.getSwapQuote.mockResolvedValue(quote);

    await expect(
      service.getQuoteResponse(requestDto, verifiedWallet as any),
    ).resolves.toEqual({
      success: true,
      provider: swapProvider.ONEINCH_FUSION,
      data: quote,
    });

    expect(inchService.getSwapQuote).toHaveBeenCalledWith({
      chain: 'OP138',
      tokenIn: requestDto.tokenIn.address,
      tokenOut: requestDto.tokenOut.address,
      walletAddress: verifiedWallet.addresses.multi,
      amount: '1000000',
    });
  });

  it('normalizes and routes Fusion Plus quote requests through the Inch service', async () => {
    const crossChainDto = {
      ...resolvedDto,
      tokenOut: {
        ...resolvedDto.tokenOut,
        chainId: ChainId.BSC,
      },
    };
    const quote = { quoteId: 'fusion-plus-quote-id' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(crossChainDto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: swapProvider.ONEINCH_FUSION_PLUS,
      transformed: crossChainDto,
    });
    inchService.getFusionPlusSwapQuote.mockResolvedValue(quote);

    await expect(
      service.getQuoteResponse(requestDto, verifiedWallet as any),
    ).resolves.toEqual({
      success: true,
      provider: swapProvider.ONEINCH_FUSION_PLUS,
      data: quote,
    });

    expect(inchService.getFusionPlusSwapQuote).toHaveBeenCalledWith({
      srcChain: 'ETH',
      dstChain: 'BSC',
      srcTokenAddress: requestDto.tokenIn.address,
      dstTokenAddress: requestDto.tokenOut.address,
      walletAddress: verifiedWallet.addresses.multi,
      amount: '1000000000000000000',
    });
  });

  it('throws BadRequestException for unsupported providers', async () => {
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(resolvedDto);
    swapProviderResolver.resolve.mockReturnValue({
      provider: 'UNKNOWN',
      transformed: resolvedDto,
    });

    await expect(service.getQuoteResponse(requestDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
