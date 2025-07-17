import { Injectable } from '@nestjs/common';
import {
  ethers,
  formatUnits,
  getAddress,
  Interface,
  parseEther,
  TransactionReceipt,
  TransactionRequest,
  TransactionResponse,
} from 'ethers';
import { JsonRpcProvider, Contract } from 'ethers';

import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import {
  broadcastTransactionToNetwork,
  getErc20ContractTokenBalance,
  getFeeData,
  getNativeCurrencyBalance,
  getNetwork,
  getTransactionCount,
} from '../common/helpers/utilityMethods';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { I_TokenInfo } from '../common/interface/tokenInfo.interface';
import { BSC_IMPORT_TOKEN_ABI, BSC_ROUTER_ABI } from '../common/abi/bsc';
import { PrepareSwapTransactionDto } from './dto/prepareSwapTransaction.dto';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';

@Injectable()
export class BscService {
  provider: JsonRpcProvider;
  routerContract: Contract;
  constructor() {
    const rpcUrl = process.env.PROVIDER_RPC_BSC;
    const routerAddress = process.env.BSC_ROUTER_ADDRESS;
    if (!rpcUrl) {
      throw new Error('Missing rpc provider');
    }

    if (!routerAddress) {
      throw new Error('Missing contract address in environment variables');
    }

    this.provider = new JsonRpcProvider(rpcUrl);

    this.routerContract = new ethers.Contract(
      routerAddress,
      BSC_ROUTER_ABI,
      this.provider,
    );
  }

  async getSwapQuote(swapQuoteDto: SwapQuoteDto): Promise<string> {
    try {
      const { tokenIn, tokenOut, amount } = swapQuoteDto;
      const path: [string, string] = [tokenIn.address, tokenOut.address];

      const amountIn: bigint = parseEther(amount);
      const amountsOut: bigint[] = (await this.routerContract.getAmountsOut(
        amountIn,
        path,
      )) as bigint[];

      return formatUnits(amountsOut[1], tokenIn.decimals);
    } catch (error: any) {
      throw new Error(`Failed to get swap quote: ${error.message}`);
    }
  }

  async prepareSwapTransaction(
    prepareSwapTransactionDto: PrepareSwapTransactionDto,
  ): Promise<TransactionRequest> {
    const { address, tokenIn, tokenOut, bnbAmount } = prepareSwapTransactionDto;
    const path: [string, string] = [
      getAddress(tokenIn.address),
      getAddress(tokenOut.address),
    ];

    const amountIn: bigint = parseEther(bnbAmount);
    const amountsOut: bigint[] = (await this.routerContract.getAmountsOut(
      amountIn,
      path,
    )) as bigint[];

    const slippagePercent = Number(process.env.BSC_SLIPPAGE ?? '5'); // fallback to 5 if undefined
    const minOut: bigint =
      (amountsOut[1] * BigInt(100 - slippagePercent)) / 100n;
    const deadline: number =
      Math.floor(Date.now() / 1000) +
      Number(process.env.BSC_TRANSACTION_WAIT_TIME_IN_SECONDS);

    const iface: Interface = new Interface(BSC_ROUTER_ABI);

    const data = iface.encodeFunctionData('swapExactETHForTokens', [
      minOut,
      path,
      address,
      deadline,
    ]);

    const nonce: number = await getTransactionCount(this.provider, address);
    const { chainId } = await getNetwork(this.provider);

    const { maxFeePerGas, maxPriorityFeePerGas } = await getFeeData(
      this.provider,
    );
    const tx: TransactionRequest = {
      to: getAddress(process.env.BSC_ROUTER_ADDRESS!),
      value: amountIn,
      gasLimit: process.env.BSC_TRANSACTION_GAS_LIMIT,
      nonce,
      chainId,
      data,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    return tx;
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

  async getUsdtTokenBalance(walletAddress: string): Promise<bigint> {
    return getErc20ContractTokenBalance(
      process.env.USDT_TOKEN_CONTRACT_ADDRESS as string,
      walletAddress,
      this.provider,
    );
  }

  async getBalance(walletAddress: string): Promise<bigint> {
    return getNativeCurrencyBalance(walletAddress, this.provider);
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
          BSC_IMPORT_TOKEN_ABI,
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
