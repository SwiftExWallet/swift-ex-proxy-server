import { BadRequestException, Injectable } from "@nestjs/common";
import { SwapQuoteDto } from "src/api/v1/common/dto/swapQuote.dto";
import { ChainIdToRango, swapProvider } from "src/api/v1/common/enums/chain.enum";

interface ProviderRule {
  provider: swapProvider;
  matches: (data: SwapQuoteDto) => boolean;
}

@Injectable()
export class SwapProviderResolver {
  private readonly rules: ProviderRule[] = [
    {
      provider: swapProvider.RANGO,
      matches: (data) =>
        String(data.tokenIn?.chainId) !== String(data.tokenOut?.chainId),
    },
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
      case swapProvider.RANGO:
        return {
          from: {
            blockchain: ChainIdToRango[data.tokenIn.chainId],
            symbol: data.tokenIn.symbol,
            address: data.tokenIn.address,
          },
          to: {
            blockchain: ChainIdToRango[data.tokenOut.chainId],
            symbol: data.tokenOut.symbol,
            address: data.tokenOut.address,
          },
          amount: data.amount,
        };

      case swapProvider.UNISWAP:
      case swapProvider.ONEINCH_FUSION:
        return data;
    }
  }
}