import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import {
  Token,
  CurrencyAmount,
  TradeType,
  Ether,
  Percent,
} from '@uniswap/sdk-core';
import { ethers, parseUnits, TransactionRequest, ZeroAddress } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ProviderService } from '../../provider/provider.service';
import {
  ResolvedSwapQuoteDto,
  ResolvedTokenInfoDto,
  SwapQuoteDto,
} from '../../common/dto/swapQuote.dto';
import { SwapQuote } from '../../common/interface/swap.interface';
import {
  ChainEnum,
  ChainId,
  swapProvider,
} from '../../common/enums/chain.enum';
import { InchService } from '../../swap/1inch/1inch.service';
import { SwapProviderResolver } from './dto/swap-provider.resolver';
import { TokenMetadataService } from '../../common/services/tokenMetadata.service';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import {
  createProviderBadRequestException,
  ProviderErrorCode,
  throwIfHttpException,
} from '../../common/utils/provider-error.util';
import { withProviderControls } from '../../common/utils/retry.util';
import {
  resolveWalletChain,
  type Wallet,
  withExplicitVerifiedWalletAddress,
} from '../../common/helpers/requestWallet';

type UniswapSwapRoute = NonNullable<Awaited<ReturnType<AlphaRouter['route']>>>;

@Injectable()
export class QuoterService {
  private readonly logger = new Logger(QuoterService.name);
  constructor(
    private readonly rpcService: ProviderService,
    private readonly inchService: InchService,
    private readonly swapProviderResolver: SwapProviderResolver,
    private readonly tokenMetadataService: TokenMetadataService,
  ) {}

  private async withProviderControl<T>(
    action: string,
    operation: (attempt: number) => Promise<T>,
  ): Promise<T> {
    return withProviderControls(`uniswap:quoter:${action}`, operation);
  }

  async getQuoteResponse(body: SwapQuoteDto) {
    const normalizedBody =
      await this.tokenMetadataService.normalizeSwapQuote(body);
    const { provider, transformed } =
      this.swapProviderResolver.resolve(normalizedBody);

    switch (provider) {
      case swapProvider.UNISWAP:
        return await this.handleValidationAndRun(
          SwapQuoteDto,
          transformed,
          this.getQuote.bind(this),
          provider,
        );

      case swapProvider.ONEINCH_FUSION:
        return await this.handleValidationAndRun(
          SwapQuoteDto,
          transformed,
          this.inchService.getSwapQuote.bind(this.inchService),
          provider,
        );

      default:
        throw new BadRequestException('Invalid provider');
    }
  }

  async buildSwapResponse(dto: SwapQuoteDto, verifiedWallet?: Wallet) {
    const walletChain = resolveWalletChain(
      dto.tokenIn?.chainId ?? dto.tokenOut?.chainId,
    );
    const normalizedDto = await this.tokenMetadataService.normalizeSwapQuote(
      verifiedWallet
        ? withExplicitVerifiedWalletAddress(
            dto,
            verifiedWallet,
            'recipient',
            walletChain,
          )
        : dto,
    );
    const quote = await this.buildSwapTx(normalizedDto);
    return {
      success: true,
      data: quote,
    };
  }

  private async handleValidationAndRun(
    dtoClass: any,
    payload: any,
    serviceMethod: (data: any) => Promise<any>,
    typeOfProvider: any,
  ) {
    const dto = plainToInstance(dtoClass, payload);

    const errors = await validate(dto);

    if (errors.length > 0) {
      const messages = this.extractErrors(errors);

      throw new BadRequestException(messages);
    }

    const result = await serviceMethod(dto);

    return {
      success: true,
      provider: typeOfProvider,
      data: result,
    };
  }

  private extractErrors(errors: ValidationError[]): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }

      if (error.children?.length) {
        messages.push(...this.extractErrors(error.children));
      }
    }

    return messages;
  }

  private isZeroAddress(value: string): boolean {
    const list = [
      '0X0000000000000000000000000000000000000000',
      '0XEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
      'ETH',
      'BNB',
      'MATIC',
      'POL',
      'AVAX',
    ];
    return list.includes(value.toUpperCase());
  }

  private buildToken(token: ResolvedTokenInfoDto, chainId: number) {
    const native = this.isZeroAddress(token.address);
    if (native) {
      return Ether.onChain(chainId);
    }

    return new Token(
      chainId,
      token.address,
      Number(token.decimals),
      token.symbol,
    );
  }

  async getQuote(
    swapQuote: ResolvedSwapQuoteDto,
    internalCall: true,
  ): Promise<UniswapSwapRoute>;
  async getQuote(
    swapQuote: ResolvedSwapQuoteDto,
    internalCall?: false,
  ): Promise<SwapQuote>;
  async getQuote(
    swapQuote: ResolvedSwapQuoteDto,
    internalCall: boolean = false,
  ): Promise<SwapQuote | UniswapSwapRoute> {
    try {
      const { tokenIn, tokenOut, amount, recipient } = swapQuote;
      const provider = new JsonRpcProvider(
        this.rpcService.getChainRpcUrl(ChainEnum[ChainId[tokenIn.chainId]]),
      );
      const router = new AlphaRouter({
        chainId: tokenIn.chainId,
        provider: provider as any,
      });
      const isNativeIn = tokenIn.address === ZeroAddress;
      const isNativeOut = tokenOut.address === ZeroAddress;
      const tokenInput = isNativeIn
        ? Ether.onChain(tokenIn.chainId)
        : this.buildToken(tokenIn, tokenIn.chainId);
      const tokenOutput = isNativeOut
        ? Ether.onChain(tokenOut.chainId)
        : this.buildToken(tokenOut, tokenOut.chainId);
      const rawAmount = parseUnits(amount, tokenIn.decimals);
      const amountIn = CurrencyAmount.fromRawAmount(
        tokenInput,
        rawAmount.toString(),
      );
      const route = await this.withProviderControl('route', () =>
        router.route(amountIn, tokenOutput, TradeType.EXACT_INPUT, {
          recipient: recipient,
          slippageTolerance: new Percent('50', '10000'), // 0.5%
          deadline: Math.floor(Date.now() / 1000) + 1800,
          type: SwapType.SWAP_ROUTER_02,
        }),
      );
      if (!route) {
        this.logger.error('No route found');
        throw createProviderBadRequestException(
          new Error('No route found'),
          ProviderErrorCode.RouteNotFound,
        );
      }
      const outputSwapAmt = route.quote.toExact();
      const slippage = 0.5;
      const minimumReceived = (Number(outputSwapAmt) * (1 - slippage)).toFixed(
        Number(tokenOut.decimals),
      );
      const gasCostWei =
        BigInt(route.estimatedGasUsed.toString()) *
        BigInt(route.gasPriceWei.toString());
      const networkFee = ethers.formatEther(gasCostWei);
      const tokenPath = route.route[0].tokenPath.map((t) => t.symbol);
      const isMultiHop = tokenPath.length > 2;
      const firstRoute = route.route[0] as {
        pools?: Array<{ fee?: { toString(): string } }>;
      };
      const fee = firstRoute.pools?.[0]?.fee?.toString() || 'N/A';
      return internalCall
        ? route
        : {
            inputAmount: amount,
            inputToken: tokenIn.symbol,
            outputAmount: outputSwapAmt,
            outputToken: tokenOut.symbol,
            pricePerToken: (Number(outputSwapAmt) / Number(amount)).toString(),
            fee: fee,
            isMultiHop: isMultiHop,
            minimumReceived: minimumReceived,
            networkFee: Number(networkFee),
          };
    } catch (e) {
      this.logger.error('error', e);
      throwIfHttpException(e);
      throw createProviderBadRequestException(e);
    }
  }

  async buildSwapTx(
    swapQuote: ResolvedSwapQuoteDto,
  ): Promise<TransactionRequest[]> {
    try {
      const { tokenIn, recipient } = swapQuote;
      const txs: TransactionRequest[] = [];
      const route = await this.getQuote(swapQuote, true);
      if (!route || !route.methodParameters) {
        throw new BadRequestException('Failed build tx');
      }
      const provider = new JsonRpcProvider(
        this.rpcService.getChainRpcUrl(ChainEnum[ChainId[tokenIn.chainId]]),
      );
      const nonce = await this.withProviderControl('transaction-count', () =>
        provider.getTransactionCount(recipient, 'pending'),
      );
      const feeData = await this.withProviderControl('fee-data', () =>
        provider.getFeeData(),
      );
      const isNativeIn = this.isZeroAddress(tokenIn.address);
      const erc20Interface = new ethers.Interface([
        'function approve(address spender,uint256 amount)',
      ]);
      //  APPROVE TX
      if (!isNativeIn) {
        txs.push({
          to: tokenIn.address,
          from: recipient,
          data: erc20Interface.encodeFunctionData('approve', [
            route.methodParameters.to,
            ethers.MaxUint256,
          ]),
          nonce: nonce,
          chainId: tokenIn.chainId,
          type: 2,
          maxFeePerGas: feeData.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
          gasLimit: '76056',
        });
      }
      //SWAP TX
      txs.push({
        to: route.methodParameters.to,
        from: recipient,
        data: route.methodParameters.calldata,
        value: route.methodParameters.value,
        nonce: isNativeIn ? nonce : nonce + 1,
        chainId: tokenIn.chainId,
        type: 2,
        maxFeePerGas: feeData.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
        gasLimit: '220000',
      });
      return txs;
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }
}
