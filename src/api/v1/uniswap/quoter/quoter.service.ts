import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import {
  CHAIN_CONFIGS,
  ERC20_ABI,
  FEE_TIERS,
  QUOTER_V2_ABI,
} from './constants/quoter.chain.config';
import { GetQuoteDto, SupportedChain, TradeType } from './dto/quoter.dto';
import { ProviderService } from '../../provider/provider.service';
import { ChainEnum } from '../../common/enums/chain.enum';

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface FeeTierQuote {
  feeTier: number;
  feeTierLabel: string;
  amountOut: string;
  amountOutFormatted: string;
  amountIn: string;
  amountInFormatted: string;
  gasEstimate: string;
  gasCostWei: string;
  gasCostEth: string;
  pricePerToken: string;
  priceImpact?: string;
}

export interface QuoteResponse {
  chain: SupportedChain;
  chainId: number;
  chainName: string;
  tradeType: TradeType;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  rawAmount: string;
  bestQuote: FeeTierQuote;
  allQuotes: FeeTierQuote[];
  slippage: string;
  minimumReceived?: string;
  maximumSent?: string;
  timestamp: number;
}

@Injectable()
export class QuoterService {
  private readonly logger = new Logger(QuoterService.name);
  constructor(private readonly rpcService: ProviderService) {}
  private readonly providerCache = new Map<SupportedChain, ethers.JsonRpcProvider>();

  private getProvider(chain: SupportedChain): ethers.JsonRpcProvider {
    
    const chainEnumMap: Record<SupportedChain, ChainEnum> = {
      [SupportedChain.ETH]: ChainEnum.ETH,
      [SupportedChain.BNB]: ChainEnum.BSC,
      [SupportedChain.POLYGON]: ChainEnum.POL,
      [SupportedChain.ARB]: ChainEnum.ARB,
      [SupportedChain.BASE]: ChainEnum.BASE,
      [SupportedChain.AVAX]: ChainEnum.AVAX,
      [SupportedChain.OPT]: ChainEnum.OP,
    };
    return this.rpcService.getProvider(chainEnumMap[chain]);
  }

  async getTokenInfo(chain: SupportedChain, address: string): Promise<TokenInfo> {
    const provider = this.getProvider(chain);
    const config = CHAIN_CONFIGS[chain];

    const isNative =
      address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      address.toLowerCase() === 'native';

    const resolvedAddress = isNative ? config.wrappedNative : address;

    try {
      const contract = new ethers.Contract(resolvedAddress, ERC20_ABI, provider);
      const [symbol, name, decimals] = await Promise.all([
        contract.symbol(),
        contract.name(),
        contract.decimals(),
      ]);
      return { address: resolvedAddress, symbol, name, decimals: Number(decimals) };
    } catch (err) {
      throw new BadRequestException(
        `Failed to fetch token info for ${resolvedAddress} on ${chain}: ${err.message}`,
      );
    }
  }

  private async quoteSingleFeeTier(
    chain: SupportedChain,
    tokenIn: TokenInfo,
    tokenOut: TokenInfo,
    amount: bigint,
    feeTier: number,
    tradeType: TradeType,
    gasPriceWei: bigint,
  ): Promise<FeeTierQuote | null> {
    const config = CHAIN_CONFIGS[chain];
    const provider = this.getProvider(chain);
    const quoter = new ethers.Contract(config.uniswapV3QuoterV2, QUOTER_V2_ABI, provider);

    try {
      let amountOut: bigint;
      let amountIn: bigint;
      let gasEstimate: bigint;

      if (tradeType === TradeType.EXACT_IN) {
        const result = await quoter.quoteExactInputSingle.staticCall({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn: amount,
          fee: feeTier,
          sqrtPriceLimitX96: 0n,
        });
        amountOut = result[0];
        gasEstimate = result[3];
        amountIn = amount;
      } else {
        const result = await quoter.quoteExactOutputSingle.staticCall({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amount,
          fee: feeTier,
          sqrtPriceLimitX96: 0n,
        });
        amountIn = result[0];
        gasEstimate = result[3];
        amountOut = amount;
      }

      const gasCostWei = gasEstimate * gasPriceWei;
      const gasCostEth = ethers.formatEther(gasCostWei);
      const amountOutNum = parseFloat(ethers.formatUnits(amountOut, tokenOut.decimals));
      const amountInNum  = parseFloat(ethers.formatUnits(amountIn,  tokenIn.decimals));
      const pricePerToken = amountInNum > 0
        ? (amountOutNum / amountInNum).toFixed(6)
        : '0';

      return {
        feeTier,
        feeTierLabel: `${feeTier / 10000}%`,
        amountOut: amountOut.toString(),
        amountOutFormatted: ethers.formatUnits(amountOut, tokenOut.decimals),
        amountIn: amountIn.toString(),
        amountInFormatted: ethers.formatUnits(amountIn, tokenIn.decimals),
        gasEstimate: gasEstimate.toString(),
        gasCostWei: gasCostWei.toString(),
        gasCostEth,
        pricePerToken,
      };
    } catch {
      return null;
    }
  }

  async getQuote(dto: GetQuoteDto): Promise<QuoteResponse> {
    try {
      const {
        chain,
        tokenIn: tokenInAddr,
        tokenOut: tokenOutAddr,
        amount,
        tradeType,
        slippage,
      } = dto;

      const config = CHAIN_CONFIGS[chain];

      this.logger.log(
        `Fetching quote on ${chain}: ${tokenInAddr} -> ${tokenOutAddr} | amount: ${amount}`
      );

      const provider = this.getProvider(chain);

      const [tokenIn, tokenOut, feeData] = await Promise.all([
        this.getTokenInfo(chain, tokenInAddr),
        this.getTokenInfo(chain, tokenOutAddr),
        provider.getFeeData(),
      ]);

      const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
      const rawAmount = BigInt(amount);
      const quotePromises = FEE_TIERS.map((fee) =>
        this.quoteSingleFeeTier(
          chain,
          tokenIn,
          tokenOut,
          rawAmount,
          fee,
          tradeType ?? TradeType.EXACT_IN,
          gasPriceWei
        )
      );

      const rawResults = await Promise.all(quotePromises);

      const validQuotes = rawResults.filter(
        (q): q is FeeTierQuote => q !== null
      );

      if (validQuotes.length === 0) {
        throw new BadRequestException(
          `No Uniswap V3 liquidity found for ${tokenIn.symbol} -> ${tokenOut.symbol} on ${config.name}`
        );
      }

      const slippageBps = parseFloat(slippage ?? "0.5") / 100;

      const allQuotes = validQuotes.map((quote) => {
        if (tradeType !== TradeType.EXACT_OUT) {
          const minOut =
            BigInt(quote.amountOut) *
            BigInt(Math.floor((1 - slippageBps) * 10000)) /
            10000n;

          return {
            ...quote,
            minimumReceived: ethers.formatUnits(minOut, tokenOut.decimals),
          };
        } else {
          const maxIn =
            BigInt(quote.amountIn) *
            BigInt(Math.floor((1 + slippageBps) * 10000)) /
            10000n;

          return {
            ...quote,
            maximumSent: ethers.formatUnits(maxIn, tokenIn.decimals),
          };
        }
      });

      const bestQuote =
        tradeType === TradeType.EXACT_OUT
          ? allQuotes.reduce((a, b) =>
            BigInt(a.amountIn) < BigInt(b.amountIn) ? a : b
          )
          : allQuotes.reduce((a, b) =>
            BigInt(a.amountOut) > BigInt(b.amountOut) ? a : b
          );

      return {
        chain,
        chainId: config.chainId,
        chainName: config.name,
        tradeType: tradeType ?? TradeType.EXACT_IN,
        tokenIn,
        tokenOut,
        rawAmount: amount,
        bestQuote,
        allQuotes,
        slippage: slippage ?? "0.5",
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error("Quote error:", error);
      this.logger.error("Error stack:", error.stack);

      const message =
        error.info?.error?.message ||
        error.shortMessage ||
        error.message ||
        "Failed to get swap quotes.";
      throw new BadRequestException(message);
    }
  }

}