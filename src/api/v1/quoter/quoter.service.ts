import { BadRequestException, Injectable } from '@nestjs/common';
import { parseUnits } from 'ethers';
import {
  ResolvedSwapQuoteDto,
  SwapQuoteDto,
} from '../common/dto/swapQuote.dto';
import {
  ChainId,
  SupportedWalletChain,
  SwapNetwork,
  swapProvider,
} from '../common/enums/chain.enum';
import { InchService } from '../swap/1inch/1inch.service';
import { UniswapService } from '../swap/uniswap/uniswap.service';
import { SwapProviderResolver } from './dto/swap-provider.resolver';
import { TokenMetadataService } from '../common/services/tokenMetadata.service';
import {
  getVerifiedWalletAddressFromWallet,
  type Wallet,
} from '../common/helpers/requestWallet';

@Injectable()
export class QuoterService {
  constructor(
    private readonly inchService: InchService,
    private readonly swapProviderResolver: SwapProviderResolver,
    private readonly tokenMetadataService: TokenMetadataService,
    private readonly uniswapService: UniswapService,
  ) {}

  async getQuoteResponse(body: SwapQuoteDto, verifiedWallet?: Wallet) {
    const normalizedBody =
      await this.tokenMetadataService.normalizeSwapQuote(body);
    const { provider, transformed } =
      this.swapProviderResolver.resolve(normalizedBody);

    switch (provider) {
      case swapProvider.UNISWAP:
        return {
          success: true,
          provider,
          data: await this.uniswapService.getSwapQuote(transformed),
        };

      case swapProvider.ONEINCH_FUSION:
        return {
          success: true,
          provider,
          data: await this.getFusionQuote(transformed, verifiedWallet),
        };

      case swapProvider.ONEINCH_FUSION_PLUS:
        console.log('====== called =====');
        console.log(await this.getFusionPlusQuote(transformed, verifiedWallet));
        return {
          success: true,
          provider,
          data: await this.getFusionPlusQuote(transformed, verifiedWallet),
        };

      default:
        throw new BadRequestException('Invalid provider');
    }
  }

  private async getFusionQuote(
    swapQuote: ResolvedSwapQuoteDto,
    verifiedWallet?: Wallet,
  ) {
    return await this.inchService.getSwapQuote({
      chain: this.toSwapNetwork(swapQuote.tokenIn.chainId),
      tokenIn: swapQuote.tokenIn.address,
      tokenOut: swapQuote.tokenOut.address,
      walletAddress: this.getFusionWalletAddress(verifiedWallet),
      amount: this.toBaseUnitAmount(swapQuote),
    });
  }

  private async getFusionPlusQuote(
    swapQuote: ResolvedSwapQuoteDto,
    verifiedWallet?: Wallet,
  ) {
    return await this.inchService.getFusionPlusSwapQuote({
      srcChain: this.toSwapNetwork(swapQuote.tokenIn.chainId),
      dstChain: this.toSwapNetwork(swapQuote.tokenOut.chainId),
      srcTokenAddress: swapQuote.tokenIn.address,
      dstTokenAddress: swapQuote.tokenOut.address,
      walletAddress: this.getFusionWalletAddress(verifiedWallet),
      amount: this.toBaseUnitAmount(swapQuote),
    });
  }

  private getFusionWalletAddress(verifiedWallet?: Wallet): string {
    if (!verifiedWallet) {
      throw new BadRequestException(
        'Verified wallet is required for gasless quotes',
      );
    }

    return getVerifiedWalletAddressFromWallet(
      verifiedWallet,
      SupportedWalletChain.multi,
    );
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

  private toBaseUnitAmount(swapQuote: ResolvedSwapQuoteDto): string {
    const decimals = Number(swapQuote.tokenIn.decimals);

    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new BadRequestException('tokenIn decimals are required');
    }

    return parseUnits(swapQuote.amount, decimals).toString();
  }
}
