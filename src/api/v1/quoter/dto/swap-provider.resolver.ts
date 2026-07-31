import { BadRequestException, Injectable } from '@nestjs/common';
import { parseUnits } from 'ethers';
import { SwapQuoteDto, SwapQuoteOption } from '../../common/dto/swapQuote.dto';
import {
  ChainId,
  SwapNetwork,
  swapProvider,
} from '../../common/enums/chain.enum';

@Injectable()
export class SwapProviderResolver {
  resolve(data: SwapQuoteDto): { provider: swapProvider; transformed: any } {
    const provider = this.resolveProvider(data);
    const transformed = this.transform(provider, data);
    return { provider, transformed };
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

  private transform(provider: swapProvider, data: SwapQuoteDto): any {
    switch (provider) {
      case swapProvider.UNISWAP:
        return data;

      case swapProvider.ONEINCH_FUSION:
        return {
          chain: this.toSwapNetwork(data.tokenIn.chainId),
          tokenIn: data.tokenIn.address,
          tokenOut: data.tokenOut.address,
          walletAddress: data.recipient,
          amount: this.toBaseUnitAmount(data),
        };

      case swapProvider.ONEINCH_FUSION_PLUS:
        return {
          srcChain: this.toSwapNetwork(data.tokenIn.chainId),
          dstChain: this.toSwapNetwork(data.tokenOut.chainId),
          srcTokenAddress: data.tokenIn.address,
          dstTokenAddress: data.tokenOut.address,
          walletAddress: data.recipient,
          amount: this.toBaseUnitAmount(data),
        };
    }
  }

  private toSwapNetwork(chainId: number): SwapNetwork {
    const chainKey = ChainId[Number(chainId)] as
      | keyof typeof SwapNetwork
      | undefined;
    const network = chainKey ? SwapNetwork[chainKey] : undefined;

    if (!network) {
      throw new BadRequestException(`Unsupported swap chainId: ${chainId}`);
    }

    return network;
  }

  private toBaseUnitAmount(data: SwapQuoteDto): string {
    const decimals = Number(data.tokenIn.decimals);

    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new BadRequestException('tokenIn decimals are required');
    }

    return parseUnits(data.amount, decimals).toString();
  }
}
