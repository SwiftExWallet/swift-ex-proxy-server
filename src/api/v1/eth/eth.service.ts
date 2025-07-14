import { Injectable } from '@nestjs/common';
import { ethers, formatUnits, parseUnits, getAddress } from 'ethers';
import { JsonRpcProvider, Contract } from 'ethers';
import { ETH_FACTORY, ETH_POOL, ETH_QUOTER } from '../common/abi/eth';
import { SwapQuoteDto } from './dto/swapQuote.dto';

@Injectable()
export class EthService {
  provider: JsonRpcProvider;
  factoryContract: Contract;
  quoterContract: Contract;
  constructor() {
    const rpcUrl = process.env.PROVIDER_RPC_ETH;
    const factoryAddress = process.env.POOL_FACTORY_CONTRACT_ADDRESS;
    const quoterAddress = process.env.QUOTER_CONTRACT_ADDRESS;
    if (!rpcUrl) {
      throw new Error('Missing rpc provider');
    }

    if (!factoryAddress || !quoterAddress) {
      throw new Error('Missing contract address in environment variables');
    }

    this.provider = new JsonRpcProvider(rpcUrl);

    this.factoryContract = new ethers.Contract(
      factoryAddress,
      ETH_FACTORY,
      this.provider,
    );

    this.quoterContract = new ethers.Contract(
      quoterAddress,
      ETH_QUOTER,
      this.provider,
    );
  }

  async getSwapQuote(swapQuoteDto: SwapQuoteDto) {
    try {
      const { tokenIn, tokenOut, amount } = swapQuoteDto;
      const poolAddress: string = (await this.factoryContract.getPool(
        tokenIn.address,
        tokenOut.address,
        amount,
      )) as string;

      if (!poolAddress) {
        throw new Error('Pool not found for token pair');
      }

      const poolContract = new ethers.Contract(
        poolAddress,
        ETH_POOL,
        this.provider,
      );
      const fee: number = (await poolContract.fee()) as number;

      const formattedAmountIn = parseUnits(amount.toString(), tokenIn.decimals);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const quotedAmountOut = await await (
        this.quoterContract.callStatic as any
      ).quoteExactInputSingle({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        fee: fee,
        recipient: getAddress('0x0000000000000000000000000000000000000000'),
        deadline: Math.floor(Date.now() / 1000) + 600,
        amountIn: formattedAmountIn,
        sqrtPriceLimitX96: 0,
      });

      const formattedAmountOut = formatUnits(
        quotedAmountOut[0],
        tokenOut.decimals,
      );

      const pricePerToken = (
        parseFloat(formattedAmountOut) / parseFloat(amount)
      ).toFixed(6);

      return {
        inputAmount: amount,
        inputToken: tokenIn.symbol,
        outputAmount: formattedAmountOut,
        outputToken: tokenOut.symbol,
        pricePerToken: pricePerToken,
        fee: fee.toString(),
        poolAddress: poolAddress,
      };
    } catch (error: any) {
      throw new Error(`Failed to get swap quote: ${error.message}`);
    }
  }
}
