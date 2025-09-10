import { Injectable, Logger } from '@nestjs/common';
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
      const tokenIn = new Token(
        1,
        swapQuoteDto.tokenIn.address,
        Number(swapQuoteDto.tokenIn.decimals),
        swapQuoteDto.tokenIn.symbol,
      );
      const tokenOut = new Token(
        1,
        swapQuoteDto.tokenOut.address,
        Number(swapQuoteDto.tokenOut.decimals),
        swapQuoteDto.tokenOut.symbol,
      );

      const quoterContract = new Contract(
        this.QUOTER_CONTRACT_ADDRESS,
        this.POOL_ABI,
        this.provider,
      );

      const amountInWei = parseUnits(swapQuoteDto.amount, tokenIn.decimals);

      const amountOut = await quoterContract.quoteExactInputSingle.staticCall(
        tokenIn.address,
        tokenOut.address,
        process.env.FEE_TIER,
        amountInWei,
        0,
      );

      const formattedAmountOut = formatUnits(amountOut, tokenOut.decimals);

      const pricePerToken =
        parseFloat(formattedAmountOut) / parseFloat(swapQuoteDto.amount);

      return {
        inputAmount: swapQuoteDto.amount,
        inputToken: swapQuoteDto.tokenIn.symbol,
        outputAmount: formattedAmountOut,
        outputToken: swapQuoteDto.tokenOut.symbol,
        pricePerToken: pricePerToken.toString(),
        fee: process.env.FEE_TIER as string,
      };
    } catch (error) {
      this.logger.error('Quote error:', error.message);
      throw error;
    }
  }

  async buildSwapTx(
    swapQuoteDto: SwapQuoteDto,
    slippageBps = process.env.UNISWAP_SLIPPAGE as any,
  ): Promise<TransactionRequest[]> {
    try {
      const quote = await this.getQuote(swapQuoteDto);

      const tokenIn = new Token(
        1,
        swapQuoteDto.tokenIn.address,
        Number(swapQuoteDto.tokenIn.decimals),
        swapQuoteDto.tokenIn.symbol,
      );
      const tokenOut = new Token(
        1,
        swapQuoteDto.tokenOut.address,
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
      const nonce = await this.provider.getTransactionCount(fromAddress, "pending");
      const feeData = await this.provider.getFeeData();
      const maxFeePerGas = feeData.maxFeePerGas ?? parseUnits("20", "gwei");
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? parseUnits("1.5", "gwei");
  
      const txs: TransactionRequest[] = [];
      if (tokenIn.symbol === AddressType.WETH) {
        const wethContract = new Contract(
          tokenIn.address,
          WETH_ABI,
          this.provider,
        );

        let wrapTx = await wethContract.deposit.populateTransaction({
          from: fromAddress,
          value: amountInWei,
          nonce,
        });

        const gasForWrap = await this.provider.estimateGas(wrapTx);
        wrapTx.gasLimit = (gasForWrap * 120n) / 100n;
        wrapTx.chainId = 1n;
        wrapTx.type = 2;
        wrapTx.maxFeePerGas = maxFeePerGas;
        wrapTx.maxPriorityFeePerGas = maxPriorityFeePerGas;

        txs.push(wrapTx);
        const txData = routerIface.encodeFunctionData("exactInputSingle", [
          {
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: process.env.FEE_TIER,
            recipient: swapQuoteDto.recipient,
            deadline,
            amountIn: amountInWei,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0,
          },
        ]);

        const swapTx: TransactionRequest = {
          to: this.SWAP_ROUTER_ADDRESS,
          from: fromAddress,
          data: txData,
          chainId: 1,
          nonce: nonce + 1,
          type: 2,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };

        const estimatedGas = await this.provider.estimateGas(swapTx);
        swapTx.gasLimit = (estimatedGas * 120n) / 100n;

        txs.push(swapTx);
      } else if (tokenIn.symbol === AddressType.ETH) {
        const txData = routerIface.encodeFunctionData("exactInputSingle", [
          {
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: process.env.FEE_TIER,
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

        const estimatedGas = await this.provider.estimateGas(rawTx);
        rawTx.gasLimit = (estimatedGas * 120n) / 100n;

        txs.push(rawTx);
      } else {
        const txData = routerIface.encodeFunctionData("exactInputSingle", [
          {
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            fee: process.env.FEE_TIER,
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
          nonce,
          type: 2,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };

        const estimatedGas = await this.provider.estimateGas(rawTx);
        rawTx.gasLimit = (estimatedGas * 120n) / 100n;

        txs.push(rawTx);
      }
      await this.checkBalanceVsTxs(fromAddress, txs);

      return txs;
    } catch (error) {
      this.logger.error("Prepare swap tx error:", error);
      throw error;
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
