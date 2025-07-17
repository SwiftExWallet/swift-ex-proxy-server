import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ethers,
  FeeData,
  formatUnits,
  parseUnits,
  TransactionReceipt,
  TransactionResponse,
} from 'ethers';
import { JsonRpcProvider, Contract } from 'ethers';
import {
  ETH_ERC20_ABI,
  ETH_FACTORY_ABI,
  ETH_POOL_ABI,
  ETH_QUOTER_ABI,
} from '../common/abi/eth';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { WalletAddressInfoDto } from './dto/walletAddressInfo.dto';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import {
  broadcastTransactionToNetwork,
  getFeeData,
  getNetwork,
  getTransactionCount,
} from '../common/helpers/utilityMethods';
import { SwapPrepareDto } from './dto/swapPrepare.dto';
import { EthSwapEnum } from '../common/enums/ethSwap.enum';
import {
  I_QuotedOutput,
  I_SwapQuote,
  I_SwapTransaction,
} from '../common/interface/swap.interface';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { I_TokenInfo } from '../common/interface/tokenInfo.interface';

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
      ETH_FACTORY_ABI,
      this.provider,
    );

    this.quoterContract = new ethers.Contract(
      quoterAddress,
      ETH_QUOTER_ABI,
      this.provider,
    );
  }

  async getSwapQuote(swapQuoteDto: SwapQuoteDto): Promise<I_SwapQuote> {
    try {
      const { tokenIn, tokenOut, amount } = swapQuoteDto;
      const poolAddress: string = (await this.factoryContract.getPool(
        tokenIn.address,
        tokenOut.address,
        process.env.FEE_TIER,
      )) as string;

      if (!poolAddress) {
        throw new Error('Pool not found for token pair');
      }

      const poolContract: Contract = new ethers.Contract(
        poolAddress,
        ETH_POOL_ABI,
        this.provider,
      );
      const fee: number = (await poolContract.fee()) as number;

      const formattedAmountIn: bigint = parseUnits(
        amount.toString(),
        tokenIn.decimals,
      );

      const quotedOutput: I_QuotedOutput =
        (await this.quoterContract.quoteExactInputSingle({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          fee: fee,
          amountIn: formattedAmountIn,
          sqrtPriceLimitX96: 0n,
        })) as I_QuotedOutput;

      const formattedAmountOut: string = formatUnits(
        quotedOutput[0],
        tokenOut.decimals,
      );

      const pricePerToken: string = (
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

  async getWalletAddressInfo(
    walletAddressInfoDto: WalletAddressInfoDto,
  ): Promise<{ transactionCount: number; gasFeeData: FeeData }> {
    const { walletAddress } = walletAddressInfoDto;
    const transactionCount: number = await getTransactionCount(
      this.provider,
      walletAddress,
    );

    const gasFeeData: FeeData = await getFeeData(this.provider);
    return {
      transactionCount,
      gasFeeData,
    };
  }

  async broadcastTransaction(
    broadcastTransactionDto: BroadcastTransactionDto,
  ): Promise<{ txHash: string; receipt: TransactionReceipt | null }> {
    const { signedTx } = broadcastTransactionDto;
    const txResponse: TransactionResponse = await broadcastTransactionToNetwork(
      this.provider,
      signedTx,
    );
    console.log('Broadcasted Tx:', txResponse.hash);

    const receipt: TransactionReceipt | null = await txResponse.wait(); // Wait for confirmation
    console.log('Receipt:', receipt);
    return {
      txHash: txResponse.hash,
      receipt,
    };
  }

  async prepareSwapTransaction(
    swapPrepareDto: SwapPrepareDto,
  ): Promise<I_SwapTransaction[]> {
    const { address, swapType, value, depositData, approveData, swapData } =
      swapPrepareDto;
    const nonce: number = await getTransactionCount(this.provider, address);
    const { chainId } = await getNetwork(this.provider);

    const txs: I_SwapTransaction[] = [];
    const { maxFeePerGas, maxPriorityFeePerGas } = await getFeeData(
      this.provider,
    );
    if (
      !process.env.WETH ||
      !process.env.ETH_SWAP_GAS_FEE_LIMIT ||
      !process.env.ETH_SWAP_TYPE ||
      !process.env.USDC ||
      !process.env.SWAP_ROUTER ||
      !maxFeePerGas ||
      !maxPriorityFeePerGas
    ) {
      throw new Error('Missing swap variable in environment variables');
    }
    if (swapType == EthSwapEnum.EthToUsdc) {
      txs.push({
        to: process.env.WETH,
        data: depositData,
        value,
        gasLimit: +process.env.ETH_SWAP_GAS_FEE_LIMIT,
        nonce,
        chainId,
        type: +process.env.ETH_SWAP_TYPE,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      txs.push({
        to: process.env.WETH,
        data: approveData,
        gasLimit: 70000,
        nonce: nonce + 1,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      txs.push({
        to: process.env.SWAP_ROUTER,
        data: swapData,
        gasLimit: 250000,
        nonce: nonce + 2,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
    } else if (swapType == EthSwapEnum.UsdcToWeth) {
      txs.push({
        to: process.env.USDC,
        data: approveData,
        gasLimit: 70000,
        nonce,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      txs.push({
        to: process.env.SWAP_ROUTER,
        data: swapData,
        gasLimit: 250000,
        nonce: nonce + 1,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
    } else {
      throw new BadRequestException('Invalid swap type');
    }
    return txs;
  }

  async executeSwapTransactions(
    txs: string[],
  ): Promise<(TransactionReceipt | undefined)[]> {
    const receipts: (TransactionReceipt | undefined)[] = [];
    for (const tx of txs) {
      const txResponse: TransactionResponse =
        await broadcastTransactionToNetwork(this.provider, tx);
      const receipt: TransactionReceipt | null = await txResponse.wait();
      receipts.push(receipt ?? undefined);
    }
    return receipts;
  }

  async getTokenInfo(getTokenInfoDto: GetTokenInfoDto): Promise<I_TokenInfo[]> {
    const { addresses, walletAddress } = getTokenInfoDto;
    let validAddresses: string[] = [];
    if (Array.isArray(addresses)) {
      validAddresses = addresses;
    } else if (typeof addresses === 'string') {
      validAddresses = addresses
        .split(/[, ]+/)
        .map((addr) => addr.trim())
        .filter((addr) => addr);
    }

    if (validAddresses.length === 0) {
      throw new Error('No valid token addresses provided');
    }

    const tokenInfos = await Promise.all(
      validAddresses.map(async (address) => {
        const tokenContract: Contract = new ethers.Contract(
          address,
          ETH_ERC20_ABI,
          this.provider,
        );
        const [name, symbol, decimals, balance] = (await Promise.all([
          tokenContract.name(),
          tokenContract.symbol(),
          tokenContract.decimals(),
          tokenContract.balanceOf(walletAddress),
        ])) as [string, string, number, bigint];

        const formattedBalance: string = formatUnits(balance, decimals);
        return {
          name,
          symbol,
          balance: formattedBalance,
          address,
          imageUrl: '',
          decimals: decimals,
        };
      }),
    );

    return tokenInfos;
  }
}
