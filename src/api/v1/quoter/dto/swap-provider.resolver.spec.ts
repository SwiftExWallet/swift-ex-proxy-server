import 'reflect-metadata';
import { ChainId, swapProvider } from '../../common/enums/chain.enum';
import { SwapQuoteDto, SwapQuoteOption } from '../../common/dto/swapQuote.dto';
import { SwapProviderResolver } from './swap-provider.resolver';

describe('SwapProviderResolver', () => {
  let resolver: SwapProviderResolver;

  const dto = {
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
    resolver = new SwapProviderResolver();
  });

  it('defaults same-chain gas-paid swaps to Uniswap', () => {
    expect(resolver.resolve(dto)).toEqual({
      provider: swapProvider.UNISWAP,
      transformed: dto,
    });
  });

  it('routes same-chain gasless swaps to 1inch Fusion', () => {
    const gaslessDto = {
      ...dto,
      option: SwapQuoteOption.GASLESS,
    };

    expect(resolver.resolve(gaslessDto)).toEqual({
      provider: swapProvider.ONEINCH_FUSION,
      transformed: {
        chain: 'ETH',
        tokenIn: dto.tokenIn.address,
        tokenOut: dto.tokenOut.address,
        walletAddress: dto.recipient,
        amount: '1000000000000000000',
      },
    });
  });

  it('routes cross-chain gas-paid swaps to Uniswap', () => {
    const crossChainDto = {
      ...dto,
      tokenOut: {
        ...dto.tokenOut,
        chainId: ChainId.BSC,
      },
    };

    expect(resolver.resolve(crossChainDto)).toEqual({
      provider: swapProvider.UNISWAP,
      transformed: crossChainDto,
    });
  });

  it('routes cross-chain gasless swaps to 1inch Fusion Plus', () => {
    const crossChainDto = {
      ...dto,
      option: SwapQuoteOption.GASLESS,
      tokenOut: {
        ...dto.tokenOut,
        chainId: ChainId.BSC,
      },
    };

    expect(resolver.resolve(crossChainDto)).toEqual({
      provider: swapProvider.ONEINCH_FUSION_PLUS,
      transformed: {
        srcChain: 'ETH',
        dstChain: 'BSC',
        srcTokenAddress: dto.tokenIn.address,
        dstTokenAddress: dto.tokenOut.address,
        walletAddress: dto.recipient,
        amount: '1000000000000000000',
      },
    });
  });
});
