import { BadRequestException, Injectable } from '@nestjs/common';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { swapProvider } from '../../common/enums/chain.enum';

interface ProviderRule {
  provider: swapProvider;
  matches: (data: SwapQuoteDto) => boolean;
}

@Injectable()
export class SwapProviderResolver {
  private readonly rules: ProviderRule[] = [
    {
      provider: swapProvider.UNISWAP,
      matches: (data) =>
        String(data.tokenIn?.chainId) === String(data.tokenOut?.chainId),
    },
  ];

  resolve(data: SwapQuoteDto): { provider: swapProvider; transformed: any } {
    const provider = this.resolveProvider(data);
    const transformed = this.transform(provider, data);
    return { provider, transformed };
  }

  private resolveProvider(data: SwapQuoteDto): swapProvider {
    for (const rule of this.rules) {
      if (rule.matches(data)) return rule.provider;
    }
    throw new BadRequestException('No matching provider found');
  }

  private transform(provider: swapProvider, data: SwapQuoteDto): any {
    switch (provider) {
      case swapProvider.UNISWAP:
      case swapProvider.ONEINCH_FUSION:
        return data;
    }
  }
}
