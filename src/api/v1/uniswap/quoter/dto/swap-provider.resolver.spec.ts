import { BadRequestException } from '@nestjs/common';
import { ChainId, swapProvider } from '../../../common/enums/chain.enum';
import { SwapQuoteDto } from '../../../common/dto/swapQuote.dto';
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

  it('resolves same-chain swaps to Uniswap', () => {
    expect(resolver.resolve(dto)).toEqual({
      provider: swapProvider.UNISWAP,
      transformed: dto,
    });
  });

  it('rejects swaps without a matching provider rule', () => {
    const crossChainDto = {
      ...dto,
      tokenOut: {
        ...dto.tokenOut,
        chainId: ChainId.BSC,
      },
    };

    expect(() => resolver.resolve(crossChainDto)).toThrow(BadRequestException);
  });
});
