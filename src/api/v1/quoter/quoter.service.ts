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
import axios, { AxiosRequestConfig } from 'axios';
import { ProviderService } from '../provider/provider.service';
import {
  ResolvedSwapQuoteDto,
  ResolvedTokenInfoDto,
  SwapQuoteDto,
} from '../common/dto/swapQuote.dto';
import { SwapQuote } from '../common/interface/swap.interface';
import {
  ChainEnum,
  ChainId,
  SupportedWalletChain,
  SwapNetwork,
  swapProvider,
} from '../common/enums/chain.enum';
import { InchService } from '../swap/1inch/1inch.service';
import { SwapProviderResolver } from './dto/swap-provider.resolver';
import { TokenMetadataService } from '../common/services/tokenMetadata.service';
import {
  createProviderBadRequestException,
  ProviderErrorCode,
  throwIfHttpException,
} from '../common/utils/provider-error.util';
import {
  getProviderHttpTimeoutMs,
  withProviderControls,
} from '../common/utils/retry.util';
import { validateProviderUrl } from '../common/config/provider-url.config';
import {
  getVerifiedWalletAddressFromWallet,
  resolveWalletChain,
  type Wallet,
  withExplicitVerifiedWalletAddress,
} from '../common/helpers/requestWallet';

type UniswapSwapRoute = NonNullable<Awaited<ReturnType<AlphaRouter['route']>>>;

const DEFAULT_UNISWAP_API_BASE_URL = 'https://trade-api.gateway.uniswap.org/v1';
const UNISWAP_ALLOWED_HOSTS = ['trade-api.gateway.uniswap.org'];

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
          data: await this.getUniswapQuote(transformed),
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

  private async getUniswapQuote(
    swapQuote: ResolvedSwapQuoteDto,
  ): Promise<SwapQuote | Record<string, unknown>> {
    if (this.isCrossChainQuote(swapQuote)) {
      return await this.getCrossChainUniswapQuote(swapQuote);
    }

    return await this.getQuote(swapQuote);
  }

  private isCrossChainQuote(swapQuote: SwapQuoteDto): boolean {
    return (
      String(swapQuote.tokenIn?.chainId) !== String(swapQuote.tokenOut?.chainId)
    );
  }

  private async getCrossChainUniswapQuote(
    swapQuote: ResolvedSwapQuoteDto,
  ): Promise<Record<string, unknown>> {
    const apiKey = process.env.UNISWAP_API_KEY;

    if (!apiKey) {
      throw new BadRequestException(
        'UNISWAP_API_KEY is required for cross-chain Uniswap quotes',
      );
    }

    if (!swapQuote.recipient) {
      throw new BadRequestException(
        'recipient is required for cross-chain Uniswap quotes',
      );
    }

    const url = `${this.getUniswapApiBaseUrl()}/quote`;
    const payload = {
      amount: this.toBaseUnitAmount(swapQuote),
      slippageTolerance: swapQuote.slippage ?? 0.5,
      swapper: swapQuote.recipient,
      tokenIn: swapQuote.tokenIn.address,
      tokenInChainId: swapQuote.tokenIn.chainId,
      tokenOut: swapQuote.tokenOut.address,
      tokenOutChainId: swapQuote.tokenOut.chainId,
      type: 'EXACT_INPUT',
    };
    const config: AxiosRequestConfig = {
      timeout: getProviderHttpTimeoutMs(),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
    };

    try {
      const response = await withProviderControls(
        'uniswap:trading-api:quote',
        () => axios.post<Record<string, unknown>>(url, payload, config),
      );

      return response.data;
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  private getUniswapApiBaseUrl(): string {
    return validateProviderUrl(
      process.env.UNISWAP_API_BASE_URL ?? DEFAULT_UNISWAP_API_BASE_URL,
      {
        source: 'UNISWAP_API_BASE_URL',
        allowedHosts: UNISWAP_ALLOWED_HOSTS,
      },
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
      const rawAmount = parseUnits(amount, Number(tokenIn.decimals));
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
