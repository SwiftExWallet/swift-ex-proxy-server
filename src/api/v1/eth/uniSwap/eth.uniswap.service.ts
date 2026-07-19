import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
  TransactionRequest,
  Interface,
} from 'ethers';
import { Token } from '@uniswap/sdk-core';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { SwapQuote } from '../../common/interface/swap.interface';
import {
  ETH_PREPARE_ABI,
  ETH_UNI_POOL_ABI,
  WETH_ABI,
} from '../../common/abi/eth';
import { ProviderService } from '../../provider/provider.service';

@Injectable()
export class UniSwapService {
  private readonly logger = new Logger(UniSwapService.name);
  private readonly provider: JsonRpcProvider;

  private readonly POOL_ABI = ETH_UNI_POOL_ABI;
  private readonly QUOTER_CONTRACT_ADDRESS = process.env
    .QUOTER_CONTRACT_ADDRESS as string;
  private readonly SINGLE_QUOTER_CONTRACT_ADDRESS = process.env
    .SINGLE_QUOTER_CONTRACT_ADDRESS as string;
  private readonly SWAP_ROUTER_ADDRESS = process.env
    .SWAP_ROUTER_ADDRESS as string;
  private readonly WETH_ADDRESS = process.env.WETH_ADDRESS as string;

  private readonly QUOTER_V2_ABI = [
    'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
  ];

  constructor(providerService: ProviderService) {
    const rpcUrl = providerService.getRpcUrl();
    this.provider = new JsonRpcProvider(rpcUrl);
  }

  private encodePath(tokens: string[], fees: number[]): string {
    let path = '0x';
    for (let i = 0; i < tokens.length - 1; i++) {
      path += tokens[i].slice(2);
      const feeHex = fees[i].toString(16).padStart(6, '0');
      path += feeHex;
    }
    path += tokens[tokens.length - 1].slice(2);
    return path;
  }

  private async tryMultiHopQuote(
    tokenInAddress: string,
    tokenOutAddress: string,
    amountInWei: bigint,
    tokenOutDecimals: number,
  ): Promise<{ amountOut: bigint; fee: string; path?: string } | null> {
    try {
      const quoterContract = new Contract(
        this.QUOTER_CONTRACT_ADDRESS,
        this.QUOTER_V2_ABI,
        this.provider,
      );

      this.logger.debug(
        `Trying multi-hop: ${tokenInAddress} → ${this.WETH_ADDRESS} → ${tokenOutAddress}`,
      );
      this.logger.debug(`Amount in (wei): ${amountInWei.toString()}`);

      const routes = [
        { fees: [10000, 500], name: '1% → 0.05%' },
        { fees: [10000, 3000], name: '1% → 0.3%' },
        { fees: [3000, 500], name: '0.3% → 0.05%' },
        { fees: [3000, 3000], name: '0.3% → 0.3%' },
        { fees: [500, 500], name: '0.05% → 0.05%' },
      ];

      for (const route of routes) {
        try {
          const tokens = [tokenInAddress, this.WETH_ADDRESS, tokenOutAddress];
          const path = this.encodePath(tokens, route.fees);

          this.logger.debug(`Testing route ${route.name}, path: ${path}`);

          const result = await quoterContract.quoteExactInput.staticCall(
            path,
            amountInWei,
          );

          const amountOut = result[0];
          const gasEstimate = result[3];

          this.logger.log(
            `Multi-hop route ${route.name} successful: ${formatUnits(amountOut, tokenOutDecimals)} (gas: ${gasEstimate.toString()})`,
          );

          return {
            amountOut,
            fee: `${route.fees[0]},${route.fees[1]}`,
            path,
          };
        } catch (error) {
          this.logger.debug(
            `Multi-hop route ${route.name} failed: ${error.message}`,
          );
          continue;
        }
      }

      return null;
    } catch (error) {
      this.logger.warn('Multi-hop quote error:', error.message);
      return null;
    }
  }

  async getQuote(swapQuoteDto: SwapQuoteDto): Promise<SwapQuote> {
    try {
      this.logger.log(
        `Getting quote for ${swapQuoteDto.amount} ${swapQuoteDto.tokenIn.symbol} → ${swapQuoteDto.tokenOut.symbol}`,
      );
      this.logger.debug(
        `Token In: ${swapQuoteDto.tokenIn.address} (${swapQuoteDto.tokenIn.decimals} decimals)`,
      );
      this.logger.debug(
        `Token Out: ${swapQuoteDto.tokenOut.address} (${swapQuoteDto.tokenOut.decimals} decimals)`,
      );

      const isNativeIn = this.isNativeToken(swapQuoteDto.tokenIn.address);
      const isNativeOut = this.isNativeToken(swapQuoteDto.tokenOut.address);

      const tokenInAddress = isNativeIn
        ? this.WETH_ADDRESS
        : swapQuoteDto.tokenIn.address;
      const tokenOutAddress = isNativeOut
        ? this.WETH_ADDRESS
        : swapQuoteDto.tokenOut.address;

      if (
        tokenInAddress.toLowerCase() === this.WETH_ADDRESS.toLowerCase() &&
        isNativeOut
      ) {
        return {
          inputAmount: swapQuoteDto.amount,
          inputToken: swapQuoteDto.tokenIn.symbol,
          outputAmount: swapQuoteDto.amount,
          outputToken: 'ETH',
          pricePerToken: '1',
          fee: '0',
          isMultiHop: false,
          path: undefined,
          isWethUnwrap: true,
        };
      }

      const tokenIn = new Token(
        1,
        tokenInAddress,
        Number(swapQuoteDto.tokenIn.decimals),
        swapQuoteDto.tokenIn.symbol,
      );
      const tokenOut = new Token(
        1,
        tokenOutAddress,
        Number(swapQuoteDto.tokenOut.decimals),
        swapQuoteDto.tokenOut.symbol,
      );

      const QUOTER_ABI = this.POOL_ABI;
      const quoterContract = new Contract(
        this.SINGLE_QUOTER_CONTRACT_ADDRESS,
        QUOTER_ABI,
        this.provider,
      );

      const amountInWei = parseUnits(swapQuoteDto.amount, tokenIn.decimals);
      this.logger.debug(`Amount in wei: ${amountInWei.toString()}`);

      const FEE_TIERS = [500, 3000, 10000];

      let amountOut: bigint | undefined;
      let selectedFeeTier: number | undefined;
      let isMultiHop = false;
      let multiHopPath: string | undefined;

      for (const feeTier of FEE_TIERS) {
        try {
          this.logger.debug(`Trying single-hop with fee tier ${feeTier}...`);

          amountOut = await quoterContract.quoteExactInputSingle.staticCall(
            tokenIn.address,
            tokenOut.address,
            feeTier,
            amountInWei,
            0,
          );
          selectedFeeTier = feeTier;
          this.logger.log(
            `Single-hop quote successful with fee tier: ${feeTier},`,
          );
          break;
        } catch (error) {
          this.logger.debug(
            `Single-hop fee tier ${feeTier} failed: ${error.message?.substring(0, 100)}`,
          );
          if (feeTier === FEE_TIERS[FEE_TIERS.length - 1]) {
            this.logger.log('Single-hop failed, trying multi-hop routing...');

            const multiHopResult = await this.tryMultiHopQuote(
              tokenInAddress,
              tokenOutAddress,
              amountInWei,
              tokenOut.decimals,
            );

            if (multiHopResult) {
              amountOut = multiHopResult.amountOut;
              selectedFeeTier = parseInt(multiHopResult.fee.split(',')[0]);
              isMultiHop = true;
              multiHopPath = multiHopResult.path;
              this.logger.log(
                `Multi-hop routing successful: ${multiHopResult.fee}`,
              );
              break;
            } else {
              throw new Error(
                'No liquidity pool found for this token pair (single or multi-hop)',
              );
            }
          }
        }
      }

      if (!amountOut || !selectedFeeTier) {
        throw new Error('Failed to get quote: No valid route found');
      }

      const formattedAmountOut = formatUnits(amountOut, tokenOut.decimals);
      const pricePerToken =
        parseFloat(formattedAmountOut) / parseFloat(swapQuoteDto.amount);

      this.logger.log(
        `Quote result: ${formattedAmountOut} ${tokenOut.symbol} (price: ${pricePerToken} per token)`,
      );
      const feeData = await this.provider.getFeeData();
      const gasPriceWei = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
      const estimatedGasUnits = isMultiHop ? 300000n : 150000n;
      const networkFeeEth = parseFloat(
        formatUnits(estimatedGasUnits * gasPriceWei, 18),
      );
      return {
        inputAmount: swapQuoteDto.amount,
        inputToken: isNativeIn ? 'ETH' : swapQuoteDto.tokenIn.symbol,
        outputAmount: formattedAmountOut,
        outputToken: isNativeOut ? 'ETH' : swapQuoteDto.tokenOut.symbol,
        pricePerToken: pricePerToken.toString(),
        fee: selectedFeeTier.toString(),
        isMultiHop,
        path: multiHopPath,
        networkFee: networkFeeEth,
      };
    } catch (error) {
      this.logger.error('Quote error:', error);
      this.logger.error('Error stack:', error.stack);
      const message =
        error.info?.error?.message ||
        error.shortMessage ||
        error.message ||
        'Failed to get swap quotes.';
      throw new BadRequestException(message);
    }
  }

  private isNativeToken(address: string): boolean {
    const NATIVE_ADDRESSES = [
      '0X0000000000000000000000000000000000000000',
      '0XEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
      'ETH',
    ];
    return NATIVE_ADDRESSES.includes(address.toUpperCase());
  }

  async buildSwapTx(
    swapQuoteDto: SwapQuoteDto,
    slippageBps = process.env.UNISWAP_SLIPPAGE as any,
  ): Promise<TransactionRequest[]> {
    try {
      const quote = await this.getQuote(swapQuoteDto);
      const isNativeIn = this.isNativeToken(swapQuoteDto.tokenIn.address);
      const isNativeOut = this.isNativeToken(swapQuoteDto.tokenOut.address);

      const tokenInAddress = isNativeIn
        ? this.WETH_ADDRESS
        : swapQuoteDto.tokenIn.address;
      const tokenOutAddress = isNativeOut
        ? this.WETH_ADDRESS
        : swapQuoteDto.tokenOut.address;

      const tokenIn = new Token(
        1,
        tokenInAddress,
        Number(swapQuoteDto.tokenIn.decimals),
        swapQuoteDto.tokenIn.symbol,
      );
      const tokenOut = new Token(
        1,
        tokenOutAddress,
        Number(swapQuoteDto.tokenOut.decimals),
        swapQuoteDto.tokenOut.symbol,
      );

      const amountInWei = parseUnits(swapQuoteDto.amount, tokenIn.decimals);
      const quotedOut = parseUnits(quote.outputAmount, tokenOut.decimals);

      const minAmountOut =
        (quotedOut * BigInt(10000 - slippageBps)) / BigInt(10000);

      const routerIface = new Interface(ETH_PREPARE_ABI);
      const deadline =
        Math.floor(Date.now() / 1000) +
        (Number(process.env.TX_DEADLINE_SEC) || 600);

      const fromAddress = swapQuoteDto.recipient;
      const [nonce, feeData, balance] = await Promise.all([
        this.provider.getTransactionCount(fromAddress, 'pending'),
        this.provider.getFeeData(),
        this.provider.getBalance(fromAddress),
      ]);

      const maxFeePerGas = feeData.maxFeePerGas ?? parseUnits('15', 'gwei');
      const maxPriorityFeePerGas =
        feeData.maxPriorityFeePerGas ?? parseUnits('1', 'gwei');

      const txs: TransactionRequest[] = [];

      // WETH to ETH using withdraw
      if (quote.isWethUnwrap) {
        const amountInWei = parseUnits(swapQuoteDto.amount, 18);
        const ERC20_ABI = [
          'function balanceOf(address) view returns (uint256)',
        ];
        const wethContract = new Contract(
          this.WETH_ADDRESS,
          ERC20_ABI,
          this.provider,
        );
        const wethBalance = await wethContract.balanceOf(fromAddress);

        if (wethBalance < amountInWei) {
          throw new BadRequestException(
            `Insufficient WETH balance. Have: ${formatUnits(wethBalance, 18)}, Need: ${swapQuoteDto.amount}`,
          );
        }

        const wethIface = new Interface(WETH_ABI);
        const withdrawData = wethIface.encodeFunctionData('withdraw', [
          amountInWei,
        ]);

        const rawTx: TransactionRequest = {
          to: this.WETH_ADDRESS,
          from: fromAddress,
          data: withdrawData,
          value: 0n,
          chainId: 1,
          nonce,
          type: 2,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };

        try {
          const estimatedGas = await this.provider.estimateGas(rawTx);
          rawTx.gasLimit = (estimatedGas * 110n) / 100n;
        } catch {
          rawTx.gasLimit = 50000n;
        }

        txs.push(rawTx);
        return txs;
      }

      if (isNativeIn) {
        const estimatedGasForSwap = quote.isMultiHop ? 250000n : 180000n;
        const estimatedGasCost = estimatedGasForSwap * maxFeePerGas;
        const totalRequired = amountInWei + estimatedGasCost;

        if (balance < totalRequired) {
          const balanceEth = formatUnits(balance, 18);
          const requiredEth = formatUnits(totalRequired, 18);
          throw new BadRequestException(
            `Insufficient ETH balance. Have: ${balanceEth} ETH, Need: ~${requiredEth} ETH (swap + gas)`,
          );
        }

        let txData: string;

        if (quote.isMultiHop && quote.path) {
          txData = routerIface.encodeFunctionData('exactInput', [
            {
              path: quote.path,
              recipient: swapQuoteDto.recipient,
              deadline,
              amountIn: amountInWei,
              amountOutMinimum: minAmountOut,
            },
          ]);
        } else {
          txData = routerIface.encodeFunctionData('exactInputSingle', [
            {
              tokenIn: tokenIn.address,
              tokenOut: tokenOut.address,
              fee: quote.fee,
              recipient: swapQuoteDto.recipient,
              deadline,
              amountIn: amountInWei,
              amountOutMinimum: minAmountOut,
              sqrtPriceLimitX96: 0,
            },
          ]);
        }

        const rawTx: TransactionRequest = {
          to: this.SWAP_ROUTER_ADDRESS,
          from: fromAddress,
          data: txData,
          value: amountInWei,
          chainId: 1,
          nonce,
          type: 2,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };

        try {
          const estimatedGas = await this.provider.estimateGas(rawTx);
          rawTx.gasLimit = (estimatedGas * 110n) / 100n;
        } catch (gasError) {
          rawTx.gasLimit = quote.isMultiHop ? 300000n : 200000n;
          this.logger.warn(
            'Gas estimation failed, using default:',
            gasError.message,
          );
        }

        txs.push(rawTx);
      } else {
        const estimatedGasForApprove = 50000n;
        const estimatedGasForSwap = quote.isMultiHop ? 250000n : 180000n;
        const estimatedTotalGas = estimatedGasForApprove + estimatedGasForSwap;
        const estimatedGasCost = estimatedTotalGas * maxFeePerGas;

        if (balance < estimatedGasCost) {
          const balanceEth = formatUnits(balance, 18);
          const requiredEth = formatUnits(estimatedGasCost, 18);
          throw new BadRequestException(
            `Insufficient ETH for gas fees. Have: ${balanceEth} ETH, Need: ~${requiredEth} ETH`,
          );
        }

        const ERC20_ABI = [
          'function balanceOf(address owner) view returns (uint256)',
          'function allowance(address owner, address spender) view returns (uint256)',
          'function approve(address spender, uint256 amount) returns (bool)',
        ];

        const tokenContract = new Contract(
          tokenIn.address,
          ERC20_ABI,
          this.provider,
        );
        const [tokenBalance, currentAllowance] = await Promise.all([
          tokenContract.balanceOf(fromAddress),
          tokenContract.allowance(fromAddress, this.SWAP_ROUTER_ADDRESS),
        ]);

        if (tokenBalance < amountInWei) {
          const balanceFormatted = formatUnits(tokenBalance, tokenIn.decimals);
          const requiredFormatted = formatUnits(amountInWei, tokenIn.decimals);
          throw new BadRequestException(
            `Insufficient ${tokenIn.symbol} balance. Have: ${balanceFormatted}, Need: ${requiredFormatted}`,
          );
        }

        let currentNonce = nonce;
        if (currentAllowance < amountInWei) {
          const approveData = tokenContract.interface.encodeFunctionData(
            'approve',
            [this.SWAP_ROUTER_ADDRESS, amountInWei],
          );

          const approveTx: TransactionRequest = {
            to: tokenIn.address,
            from: fromAddress,
            data: approveData,
            chainId: 1,
            nonce: currentNonce,
            type: 2,
            maxFeePerGas,
            maxPriorityFeePerGas,
          };

          try {
            const approveGas = await this.provider.estimateGas(approveTx);
            approveTx.gasLimit = (approveGas * 110n) / 100n;
          } catch (gasError) {
            approveTx.gasLimit = 60000n;
            this.logger.warn(
              'Approve gas estimation failed, using default:',
              gasError.message,
            );
          }

          txs.push(approveTx);
          currentNonce += 1;
        }

        let txData: string;

        if (quote.isMultiHop && quote.path) {
          txData = routerIface.encodeFunctionData('exactInput', [
            {
              path: quote.path,
              recipient: swapQuoteDto.recipient,
              deadline,
              amountIn: amountInWei,
              amountOutMinimum: minAmountOut,
            },
          ]);
        } else {
          txData = routerIface.encodeFunctionData('exactInputSingle', [
            {
              tokenIn: tokenIn.address,
              tokenOut: tokenOut.address,
              fee: quote.fee,
              recipient: swapQuoteDto.recipient,
              deadline,
              amountIn: amountInWei,
              amountOutMinimum: minAmountOut,
              sqrtPriceLimitX96: 0,
            },
          ]);
        }

        const rawTx: TransactionRequest = {
          to: this.SWAP_ROUTER_ADDRESS,
          from: fromAddress,
          data: txData,
          chainId: 1,
          nonce: currentNonce,
          type: 2,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };

        try {
          const estimatedGas = await this.provider.estimateGas(rawTx);
          rawTx.gasLimit = (estimatedGas * 110n) / 100n;
        } catch (gasError) {
          rawTx.gasLimit = quote.isMultiHop ? 300000n : 200000n;
          this.logger.warn(
            'Swap gas estimation failed, using default:',
            gasError.message,
          );
        }

        txs.push(rawTx);
      }

      return txs;
    } catch (error) {
      this.logger.error('Prepare swap tx error:', error);
      const message =
        error.info?.error?.message ||
        error.shortMessage ||
        error.message ||
        'Failed prepare swap tx';
      throw new BadRequestException(message);
    }
  }
}
