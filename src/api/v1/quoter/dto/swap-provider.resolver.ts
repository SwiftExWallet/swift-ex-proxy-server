import { Injectable } from '@nestjs/common';
import { SwapQuoteDto, SwapQuoteOption } from '../../common/dto/swapQuote.dto';
import { swapProvider } from '../../common/enums/chain.enum';

@Injectable()
export class SwapProviderResolver {
  resolve(data: SwapQuoteDto): { provider: swapProvider; transformed: any } {
    const provider = this.resolveProvider(data);
    return { provider, transformed: data };
  }

  private resolveProvider(data: SwapQuoteDto): swapProvider {
    const sameChain =
      String(data.tokenIn?.chainId) === String(data.tokenOut?.chainId);

    if (data.option === SwapQuoteOption.GASLESS) {
      return sameChain
        ? swapProvider.ONEINCH_FUSION
        : swapProvider.ONEINCH_FUSION_PLUS;
    }

    return swapProvider.UNISWAP;
  }
}
