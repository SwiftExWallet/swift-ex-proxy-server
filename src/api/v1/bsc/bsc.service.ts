import { Injectable } from '@nestjs/common';
import {
  FeeData,
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
  getEstimateGas,
  getFeeData,
  getNativeCurrencyBalance,
  getNetwork,
  getTransactionCount,
} from '../common/helpers/blockchainUtilityMethods';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { TokenInfo } from '../common/interface/tokenInfo.interface';
import { BSC_IMPORT_TOKEN_ABI, BSC_ROUTER_ABI } from '../common/abi/bsc';
import { PrepareSwapTransactionDto } from './dto/prepareSwapTransaction.dto';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { ProviderService } from '../provider/provider.service';
import { ChainEnum } from '../common/enums/chain.enum';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { FullTransaction } from '../common/interface/transaction.interface';
import { ValidateAddress } from '../common/helpers/utilityMethods';
import { getErc20ContractInfo } from '../common/helpers/contractUtilityMethod';

@Injectable()
export class BscService {
  provider: JsonRpcProvider;
  routerContract: Contract;
  constructor(private readonly providerService: ProviderService) {
    const routerAddress = process.env.BSC_ROUTER_ADDRESS;

    if (!routerAddress) {
      throw new Error('Missing contract address in environment variables');
    }

    this.provider = this.providerService.getProvider(ChainEnum.BSC);

    this.routerContract = this.providerService.getContract(
      routerAddress,
      BSC_ROUTER_ABI,
      ChainEnum.BSC,
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

  async getUsdtTokenBalance(
    walletAddress: string,
    tokenAddress: string,
  ): Promise<{ walletBalance: bigint; tokenBalance: bigint }> {
    const [walletBalance, tokenBalance] = await Promise.all([
      this.getBalance(walletAddress),
      getErc20ContractTokenBalance(tokenAddress, walletAddress, this.provider),
    ]);

    return { walletBalance, tokenBalance };
  }

  async getBalance(walletAddress: string): Promise<bigint> {
    return getNativeCurrencyBalance(walletAddress, this.provider);
  }

  async getWalletAddressInfo(
    walletAddress: string,
  ): Promise<{ transactionCount: number; gasFeeData: FeeData }> {
    const [transactionCount, gasFeeData] = await Promise.all([
      getTransactionCount(this.provider, walletAddress),
      getFeeData(this.provider),
    ]);

    return {
      transactionCount,
      gasFeeData,
    };
  }

  async getTokenInfo(getTokenInfoDto: GetTokenInfoDto): Promise<TokenInfo[]> {
    const { addresses, walletAddress } = getTokenInfoDto;
    const validAddresses: string[] = ValidateAddress(addresses);

    if (validAddresses.length === 0) {
      throw new Error('No valid token addresses provided');
    }

    const tokenInfos = await Promise.all(
      validAddresses.map(async (address) => {
        const tokenContract: Contract = this.providerService.getContract(
          address,
          BSC_IMPORT_TOKEN_ABI,
          ChainEnum.BSC,
        );
        const { name, symbol, decimals, balance } = await getErc20ContractInfo(
          tokenContract,
          walletAddress,
        );

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

  async prepareTransaction(
    prepareTransactionDto: PrepareTransactionDto,
  ): Promise<FullTransaction> {
    const { unsignedTx, walletAddress } = prepareTransactionDto;
    const [nonce, gasLimit, feeData, network] = await Promise.all([
      getTransactionCount(this.provider, walletAddress),
      getEstimateGas(this.provider, walletAddress, unsignedTx),
      getFeeData(this.provider),
      getNetwork(this.provider),
    ]);

    const transaction: FullTransaction = {
      unsignedTx,
      nonce,
      gasLimit,
      gasPrice: feeData?.gasPrice,
      chainId: network.chainId,
    };
    return transaction;
  }
}
