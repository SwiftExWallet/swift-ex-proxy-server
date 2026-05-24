import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

import {
  Contract,
  Interface,
  TransactionRequest,
  ethers,
  parseUnits,
  formatUnits,
} from 'ethers';

import { Token } from '@uniswap/sdk-core';

import { SwapQuoteDto } from '../../../common/dto/swapQuote.dto';
import { SwapQuote } from '../../../common/interface/swap.interface';

import {
  ETH_PREPARE_ABI,
  WETH_ABI,
} from '../../../common/abi/eth';

import { ProviderService } from 'src/api/v1/provider/provider.service';
import { ChainEnum } from 'src/api/v1/common/enums/chain.enum';

import {
  CHAIN_CONFIGS,
  QUOTER_V2_ABI,
} from '../constants/quoter.chain.config';

import { SupportedChain } from '../dto/quoter.dto';

@Injectable()
export class SwapService {
  private readonly logger = new Logger(SwapService.name);

  constructor(
    private readonly providerService: ProviderService,
  ) { }

  private async estimateNetworkFee(
    chain: SupportedChain,
    isNativeOut: boolean,
    quoterGasEstimate = 0n,
  ): Promise<{ networkFee: string; networkFeeWei: bigint }> {
    try {
      const feeData = await this.getProvider(chain).getFeeData();
      const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? parseUnits('3', 'gwei');

      const gasUnits = quoterGasEstimate > 0n
        ? (quoterGasEstimate * 120n) / 100n
        : isNativeOut
          ? 220000n
          : 150000n;

      const networkFeeWei = gasUnits * gasPrice;
      const networkFee = formatUnits(networkFeeWei, 18);

      return { networkFee, networkFeeWei };
    } catch {
      return { networkFee: '0', networkFeeWei: 0n };
    }
  }

  private resolveSupportedChain(
    chainId: any,
  ): SupportedChain {
    return ChainEnum[
      chainId
    ] as unknown as SupportedChain;
  }

  private getProvider(
    chain: SupportedChain,
  ): ethers.JsonRpcProvider {
    return this.providerService.getProvider(
      chain as unknown as ChainEnum,
    );
  }

  private cfg(chain: SupportedChain) {
    return CHAIN_CONFIGS[chain];
  }

  private router(
    chain: SupportedChain,
  ): string {
    return this.cfg(chain).swapRouter;
  }

  private wrapped(
    chain: SupportedChain,
  ): string {
    return this.cfg(chain).wrappedNative;
  }

  private isNative(
    value: string,
  ): boolean {
    const list = [
      '0X0000000000000000000000000000000000000000',
      '0XEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
      'ETH',
      'BNB',
      'MATIC',
      'POL',
      'AVAX',
    ];

    return list.includes(
      value.toUpperCase(),
    );
  }

  private toBigInt(
    value: any,
  ): bigint {
    return ethers.toBigInt(value);
  }

  private async gasPricing(
    chain: SupportedChain,
  ) {
    const fee =
      await this.getProvider(
        chain,
      ).getFeeData();

    const gasPrice =
      fee.gasPrice ??
      parseUnits('3', 'gwei');

    return {
      maxFeePerGas:
        fee.maxFeePerGas ??
        gasPrice,

      maxPriorityFeePerGas:
        fee.maxPriorityFeePerGas ??
        parseUnits('1', 'gwei'),
    };
  }

  private async estimateGasWithBuffer(
    tx: TransactionRequest,
    chain: SupportedChain,
    fallback: bigint,
  ): Promise<bigint> {
    try {
      const gas =
        await this.getProvider(
          chain,
        ).estimateGas(tx);

      return (gas * 115n) / 100n;
    } catch {
      return fallback;
    }
  }

  async getQuote(
    dto: SwapQuoteDto,
    slippageBps = 100,
  ): Promise<SwapQuote> {
    try {
      const chain = this.resolveSupportedChain(dto.tokenIn.chainId);
      const config = this.cfg(chain);
      const wrapped = this.wrapped(chain);

      const isNativeIn = this.isNative(dto.tokenIn.address);
      const isNativeOut = this.isNative(dto.tokenOut.address);

      const tokenInAddress = isNativeIn ? wrapped : dto.tokenIn.address;
      const tokenOutAddress = isNativeOut ? wrapped : dto.tokenOut.address;

      if (
        tokenInAddress.toLowerCase() === wrapped.toLowerCase() &&
        isNativeOut
      ) {
        const { networkFee } = await this.estimateNetworkFee(chain, false);

        return {
          inputAmount: dto.amount,
          inputToken: dto.tokenIn.symbol,
          outputAmount: dto.amount,
          outputToken: config.nativeSymbol,
          pricePerToken: '1',
          fee: '0',
          isMultiHop: false,
          isWethUnwrap: true,
          minimumReceived: dto.amount,
          networkFee: Number(networkFee),
        };
      }

      const tokenIn = new Token(
        config.chainId,
        tokenInAddress,
        Number(dto.tokenIn.decimals),
        dto.tokenIn.symbol,
      );

      const tokenOut = new Token(
        config.chainId,
        tokenOutAddress,
        Number(dto.tokenOut.decimals),
        dto.tokenOut.symbol,
      );

      const amountInWei = parseUnits(dto.amount, tokenIn.decimals);

      const quoter = new Contract(
        config.uniswapV3QuoterV2,
        QUOTER_V2_ABI,
        this.getProvider(chain),
      );

      const feeTiers = [500, 3000, 10000];

      let selectedFee = 0;
      let amountOut = 0n;
      let gasEstimateFromQuoter = 0n;

      for (const fee of feeTiers) {
        try {
          const result = await quoter.quoteExactInputSingle.staticCall({
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            amountIn: amountInWei,
            fee,
            sqrtPriceLimitX96: 0n,
          });

          amountOut = result[0];
          gasEstimateFromQuoter = result[3];
          selectedFee = fee;
          break;
        } catch { }
      }

      if (amountOut === 0n) {
        throw new Error('No route found');
      }

      const out = formatUnits(amountOut, tokenOut.decimals);
      const minAmountOutWei = (amountOut * BigInt(10000 - slippageBps)) / 10000n;
      const minimumReceived = formatUnits(minAmountOutWei, tokenOut.decimals);

      const { networkFee, networkFeeWei } = await this.estimateNetworkFee(
        chain,
        isNativeOut,
        gasEstimateFromQuoter,
      );

      return {
        inputAmount: dto.amount,
        inputToken: dto.tokenIn.symbol,
        outputAmount: out,
        outputToken: isNativeOut ? config.nativeSymbol : dto.tokenOut.symbol,
        pricePerToken: (Number(out) / Number(dto.amount)).toString(),
        fee: selectedFee.toString(),
        isMultiHop: false,
        minimumReceived,
        networkFee: Number(networkFee),
      };
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }


  async buildSwapTx(
    dto: SwapQuoteDto,
    slippageBps = 100,
  ): Promise<
    TransactionRequest[]
  > {
    try {
      const quote =
        await this.getQuote(dto);

      const chain =
        this.resolveSupportedChain(
          dto.tokenIn.chainId,
        );

      const config =
        this.cfg(chain);

      const provider =
        this.getProvider(chain);

      const router =
        this.router(chain);

      const wrapped =
        this.wrapped(chain);

      const iface =
        new Interface(
          ETH_PREPARE_ABI,
        );

      const isNativeIn =
        this.isNative(
          dto.tokenIn.address,
        );

      const isNativeOut =
        this.isNative(
          dto.tokenOut.address,
        );

      const tokenInAddress =
        isNativeIn
          ? wrapped
          : dto.tokenIn.address;

      const tokenOutAddress =
        isNativeOut
          ? wrapped
          : dto.tokenOut.address;

      const tokenIn =
        new Token(
          config.chainId,
          tokenInAddress,
          Number(
            dto.tokenIn.decimals,
          ),
          dto.tokenIn.symbol,
        );

      const tokenOut =
        new Token(
          config.chainId,
          tokenOutAddress,
          Number(
            dto.tokenOut.decimals,
          ),
          dto.tokenOut.symbol,
        );

      const amountInWei =
        parseUnits(
          dto.amount,
          tokenIn.decimals,
        );

      const quoteOutWei =
        parseUnits(
          quote.outputAmount,
          tokenOut.decimals,
        );

      const minOut =
        (quoteOutWei *
          BigInt(
            10000 -
            slippageBps,
          )) /
        10000n;

      const deadline =
        Math.floor(
          Date.now() / 1000,
        ) + 600;

      const wallet =
        dto.recipient!;

      const [
        nonce,
        nativeBalance,
      ] = await Promise.all([
        provider.getTransactionCount(
          wallet,
          'pending',
        ),
        provider.getBalance(
          wallet,
        ),
      ]);

      const gas =
        await this.gasPricing(
          chain,
        );

      const txs: TransactionRequest[] =
        [];

      if (isNativeIn) {
        const data =
          iface.encodeFunctionData(
            'exactInputSingle',
            [
              {
                tokenIn:
                  tokenIn.address,
                tokenOut:
                  tokenOut.address,
                fee: Number(
                  quote.fee,
                ),
                recipient:
                  wallet,
                deadline,
                amountIn:
                  amountInWei,
                amountOutMinimum:
                  minOut,
                sqrtPriceLimitX96:
                  0,
              },
            ],
          );

        const tx: TransactionRequest =
        {
          to: router,
          from: wallet,
          data,
          value:
            amountInWei,
          nonce,
          chainId:
            config.chainId,
          type: 2,
          maxFeePerGas:
            gas.maxFeePerGas,
          maxPriorityFeePerGas:
            gas.maxPriorityFeePerGas,
        };

        tx.gasLimit =
          await this.estimateGasWithBuffer(
            tx,
            chain,
            180000n,
          );

        const totalNeed =
          amountInWei +
          this.toBigInt(
            tx.gasLimit,
          ) *
          gas.maxFeePerGas;

        if (
          nativeBalance <
          totalNeed
        ) {
          throw new BadRequestException(
            `Insufficient ${config.nativeSymbol}. Have ${formatUnits(
              nativeBalance,
              18,
            )}, Need ~${formatUnits(
              totalNeed,
              18,
            )}`,
          );
        }

        txs.push(tx);
        return txs;
      }

      const erc20 =
        new Contract(
          tokenIn.address,
          [
            'function balanceOf(address) view returns (uint256)',
            'function allowance(address,address) view returns (uint256)',
            'function approve(address,uint256) returns (bool)',
          ],
          provider,
        );

      const [
        tokenBalance,
        allowance,
      ] = await Promise.all([
        erc20.balanceOf(
          wallet,
        ),
        erc20.allowance(
          wallet,
          router,
        ),
      ]);

      if (
        tokenBalance <
        amountInWei
      ) {
        throw new BadRequestException(
          `Insufficient ${tokenIn.symbol}`,
        );
      }

      let currentNonce =
        nonce;
      if (
        allowance <
        amountInWei
      ) {
        const approveData =
          erc20.interface.encodeFunctionData(
            'approve',
            [
              router,
              amountInWei,
            ],
          );

        const approveTx: TransactionRequest =
        {
          to: tokenIn.address,
          from: wallet,
          data: approveData,
          nonce:
            currentNonce,
          chainId:
            config.chainId,
          type: 2,
          maxFeePerGas:
            gas.maxFeePerGas,
          maxPriorityFeePerGas:
            gas.maxPriorityFeePerGas,
        };

        approveTx.gasLimit =
          await this.estimateGasWithBuffer(
            approveTx,
            chain,
            60000n,
          );

        txs.push(
          approveTx,
        );

        currentNonce++;
      }

      let swapData: string;

      if (isNativeOut) {
        const singleSwap =
          iface.encodeFunctionData(
            'exactInputSingle',
            [
              {
                tokenIn:
                  tokenIn.address,
                tokenOut:
                  wrapped,
                fee: Number(
                  quote.fee,
                ),
                recipient:
                  router,
                deadline,
                amountIn:
                  amountInWei,
                amountOutMinimum:
                  minOut,
                sqrtPriceLimitX96:
                  0,
              },
            ],
          );

        const unwrap =
          iface.encodeFunctionData(
            'unwrapWETH9',
            [
              minOut,
              wallet,
            ],
          );

        swapData =
          iface.encodeFunctionData(
            'multicall',
            [
              [
                singleSwap,
                unwrap,
              ],
            ],
          );
      }

      else {
        swapData =
          iface.encodeFunctionData(
            'exactInputSingle',
            [
              {
                tokenIn:
                  tokenIn.address,
                tokenOut:
                  tokenOut.address,
                fee: Number(
                  quote.fee,
                ),
                recipient:
                  wallet,
                deadline,
                amountIn:
                  amountInWei,
                amountOutMinimum:
                  minOut,
                sqrtPriceLimitX96:
                  0,
              },
            ],
          );
      }

      const swapTx: TransactionRequest =
      {
        to: router,
        from: wallet,
        data: swapData,
        nonce:
          currentNonce,
        chainId:
          config.chainId,
        type: 2,
        maxFeePerGas:
          gas.maxFeePerGas,
        maxPriorityFeePerGas:
          gas.maxPriorityFeePerGas,
      };

      swapTx.gasLimit =
        await this.estimateGasWithBuffer(
          swapTx,
          chain,
          220000n,
        );

      const totalGas =
        txs.reduce(
          (
            a,
            b,
          ) =>
            a +
            this.toBigInt(
              b.gasLimit ??
              0,
            ),
          0n,
        ) +
        this.toBigInt(
          swapTx.gasLimit,
        );

      const gasCost =
        totalGas *
        gas.maxFeePerGas;

      if (
        nativeBalance <
        gasCost
      ) {
        throw new BadRequestException(
          `Insufficient ${config.nativeSymbol} for gas. Have ${formatUnits(
            nativeBalance,
            18,
          )}, Need ~${formatUnits(
            gasCost,
            18,
          )}`,
        );
      }

      txs.push(
        swapTx,
      );

      return txs;
    } catch (e: any) {
      this.logger.error(e);

      throw new BadRequestException(
        e.message ||
        'Failed build tx',
      );
    }
  }
}