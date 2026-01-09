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
import { ETH_PREPARE_ABI, ETH_UNI_POOL_ABI, WETH_ABI } from '../../common/abi/eth';
import { AddressType } from '../../common/enums/pancake.enum';
import { ProviderService } from '../../provider/provider.service';

@Injectable()
export class UniSwapService {
  private readonly logger = new Logger(UniSwapService.name);
  private readonly provider: JsonRpcProvider;

  private readonly POOL_ABI = ETH_UNI_POOL_ABI;
  private readonly QUOTER_CONTRACT_ADDRESS = process.env
    .QUOTER_CONTRACT_ADDRESS as string;
  private readonly SWAP_ROUTER_ADDRESS = process.env
    .SWAP_ROUTER_ADDRESS as string;

  constructor(private readonly providerService: ProviderService) {
      const rpcUrl = providerService.getRpcUrl();
        this.provider = new JsonRpcProvider(rpcUrl);
  }

  async getQuote(swapQuoteDto: SwapQuoteDto): Promise<SwapQuote> {
  try {
    const isNativeIn = this.isNativeToken(swapQuoteDto.tokenIn.address);
    const isNativeOut = this.isNativeToken(swapQuoteDto.tokenOut.address);
    const WETH_ADDRESS = process.env.WETH_ADDRESS as string;
    const tokenInAddress = isNativeIn ? WETH_ADDRESS : swapQuoteDto.tokenIn.address;
    const tokenOutAddress = isNativeOut ? WETH_ADDRESS : swapQuoteDto.tokenOut.address;
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
      this.QUOTER_CONTRACT_ADDRESS,
      QUOTER_ABI,
      this.provider,
    );

    const amountInWei = parseUnits(swapQuoteDto.amount, tokenIn.decimals);

    const FEE_TIERS = [500, 3000, 10000];
    let amountOut;
    let selectedFeeTier;

    for (const feeTier of FEE_TIERS) {
      try {
        amountOut = await quoterContract.quoteExactInputSingle.staticCall(
          tokenIn.address,
          tokenOut.address,
          feeTier,
          amountInWei,
          0,
        );
        selectedFeeTier = feeTier;
        this.logger.log(`Quote successful with fee tier: ${feeTier}`);
        break; 
      } catch (error) {
        this.logger.warn(`Fee tier ${feeTier} failed, trying next...`);
        if (feeTier === FEE_TIERS[FEE_TIERS.length - 1]) {
          throw new Error('No liquidity pool found for this token pair');
        }
      }
    }

    const formattedAmountOut = formatUnits(amountOut, tokenOut.decimals);

    const pricePerToken =
      parseFloat(formattedAmountOut) / parseFloat(swapQuoteDto.amount);

    return {
      inputAmount: swapQuoteDto.amount,
      inputToken: isNativeIn ? 'ETH' : swapQuoteDto.tokenIn.symbol,
      outputAmount: formattedAmountOut,
      outputToken: isNativeOut ? 'ETH' : swapQuoteDto.tokenOut.symbol,
      pricePerToken: pricePerToken.toString(),
      fee: selectedFeeTier.toString(),
    };
  } catch (error) {
    this.logger.error('Quote error:', error);
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
      const WETH_ADDRESS = process.env.WETH_ADDRESS as string;
      const tokenInAddress = isNativeIn ? WETH_ADDRESS : swapQuoteDto.tokenIn.address;
      const tokenOutAddress = isNativeOut ? WETH_ADDRESS : swapQuoteDto.tokenOut.address;

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

      const fromAddress = swapQuoteDto.recipient!;
      const [nonce, feeData, balance] = await Promise.all([
        this.provider.getTransactionCount(fromAddress, "pending"),
        this.provider.getFeeData(),
        this.provider.getBalance(fromAddress)
      ]);

      const maxFeePerGas = feeData.maxFeePerGas ?? parseUnits("15", "gwei");
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? parseUnits("1", "gwei");

      const txs: TransactionRequest[] = [];

      if (isNativeIn) {
        const estimatedGasForSwap = 180000n;
        const estimatedGasCost = estimatedGasForSwap * maxFeePerGas;
        const totalRequired = amountInWei + estimatedGasCost;

        if (balance < totalRequired) {
          const balanceEth = formatUnits(balance, 18);
          const requiredEth = formatUnits(totalRequired, 18);
          throw new BadRequestException(
            `Insufficient ETH balance. Have: ${balanceEth} ETH, Need: ~${requiredEth} ETH (swap + gas)`
          );
        }

        const txData = routerIface.encodeFunctionData("exactInputSingle", [
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
          rawTx.gasLimit = 200000n;
          this.logger.warn('Gas estimation failed, using default:', gasError.message);
        }

        txs.push(rawTx);
      }
      else {
        const estimatedGasForApprove = 50000n;
        const estimatedGasForSwap = 180000n;
        const estimatedTotalGas = estimatedGasForApprove + estimatedGasForSwap;
        const estimatedGasCost = estimatedTotalGas * maxFeePerGas;

        if (balance < estimatedGasCost) {
          const balanceEth = formatUnits(balance, 18);
          const requiredEth = formatUnits(estimatedGasCost, 18);
          throw new BadRequestException(
            `Insufficient ETH for gas fees. Have: ${balanceEth} ETH, Need: ~${requiredEth} ETH`
          );
        }

        const ERC20_ABI = [
          'function balanceOf(address owner) view returns (uint256)',
          'function allowance(address owner, address spender) view returns (uint256)',
          'function approve(address spender, uint256 amount) returns (bool)',
        ];

        const tokenContract = new Contract(tokenIn.address, ERC20_ABI, this.provider);
        const [tokenBalance, currentAllowance] = await Promise.all([
          tokenContract.balanceOf(fromAddress),
          tokenContract.allowance(fromAddress, this.SWAP_ROUTER_ADDRESS)
        ]);

        if (tokenBalance < amountInWei) {
          const balanceFormatted = formatUnits(tokenBalance, tokenIn.decimals);
          const requiredFormatted = formatUnits(amountInWei, tokenIn.decimals);
          throw new BadRequestException(
            `Insufficient ${tokenIn.symbol} balance. Have: ${balanceFormatted}, Need: ${requiredFormatted}`
          );
        }
        let currentNonce = nonce;
        if (currentAllowance < amountInWei) {
          const approveData = tokenContract.interface.encodeFunctionData('approve', [
            this.SWAP_ROUTER_ADDRESS,
            amountInWei,
          ]);

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
            this.logger.warn('Approve gas estimation failed, using default:', gasError.message);
          }

          txs.push(approveTx);
          currentNonce += 1;
        }

        const txData = routerIface.encodeFunctionData("exactInputSingle", [
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
          rawTx.gasLimit = 200000n;
          this.logger.warn('Swap gas estimation failed, using default:', gasError.message);
        }

        txs.push(rawTx);
      }

      return txs;
    } catch (error) {
      this.logger.error("Prepare swap tx error:", error);
      const message =
        error.info?.error?.message ||
        error.shortMessage ||
        error.message ||
        'Failed prepare swap tx';
      throw new BadRequestException(message);
    }
  }
  
  private async checkBalanceVsTxs(address: string, txs: TransactionRequest[]) {
    const balance = await this.provider.getBalance(address);
    let totalRequired = 0n;
    for (const tx of txs) {
      const gasLimit = tx.gasLimit ? BigInt(tx.gasLimit.toString()) : 0n;
      const gasPrice =
        tx.maxFeePerGas != null
          ? BigInt(tx.maxFeePerGas.toString())
          : 0n;
  
      const gasCost = gasLimit * gasPrice;
      const value = tx.value ? BigInt(tx.value.toString()) : 0n;
  
      totalRequired += gasCost + value;
    }
    if (balance < totalRequired) {
      throw new Error(
        `Insufficient funds: Balance=${balance} Required=${totalRequired}`
      );
    }
  
    this.logger.debug(
      `Balance check passed Balance=${balance} Required=${totalRequired}`
    );
  }
  
  
}
