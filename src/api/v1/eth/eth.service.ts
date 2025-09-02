import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ethers,
  FeeData,
  formatUnits,
  Interface,
  parseEther,
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
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import {
  broadcastTransactionToNetwork,
  getEstimateGas,
  getFeeData,
  getNativeCurrencyBalance,
  getNetwork,
  getTransactionCount,
} from '../common/helpers/blockchainUtilityMethods';
import { SwapPrepareDto } from './dto/swapPrepare.dto';
import { EthSwapEnum } from '../common/enums/ethSwap.enum';

import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { TokenInfo } from '../common/interface/tokenInfo.interface';
import { UsdtSwapQuoteDto } from './dto/usdtSwapQuote.dto';
import { ProviderService } from '../provider/provider.service';
import { ChainEnum } from '../common/enums/chain.enum';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import {
  QuotedOutput,
  SwapQuote,
  SwapTransaction,
  SwapTx,
} from '../common/interface/swap.interface';
import { FullTransaction } from '../common/interface/transaction.interface';
import { ValidateAddress } from '../common/helpers/utilityMethods';
import {
  getPool,
  getPoolContractFee,
  quoteExactInputSingle,
  getErc20ContractInfo,
} from '../common/helpers/contractUtilityMethod';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
import { UniSwapService } from './uniSwap/eth.uniswap.service';
@Injectable()
export class EthService {
  private readonly logger = new Logger(EthService.name);

  provider: JsonRpcProvider;
  factoryContract: Contract;
  quoterContract: Contract;
  swapRouterContract: Contract;
  constructor(private readonly providerService: ProviderService,private readonly uniSwapService:UniSwapService) {
    const factoryAddress = process.env.POOL_FACTORY_CONTRACT_ADDRESS;
    const quoterAddress = process.env.QUOTER_CONTRACT_ADDRESS;
    const swapRouterAddress = process.env.SWAP_ROUTER_ADDRESS;

    if (!factoryAddress || !quoterAddress || !swapRouterAddress) {
      throw new Error('Missing contract address in environment variables');
    }

    this.provider = this.providerService.getProvider(ChainEnum.ETH);

    this.factoryContract = this.providerService.getContract(
      factoryAddress,
      ETH_FACTORY_ABI,
      ChainEnum.ETH,
    );

    this.quoterContract = this.providerService.getContract(
      quoterAddress,
      ETH_QUOTER_ABI,
      ChainEnum.ETH,
    );
  }

  async getSwapQuote(swapQuoteDto: SwapQuoteDto): Promise<SwapQuote> {
    return await this.uniSwapService.getQuote(swapQuoteDto)
  }

  async prepareUsdtSwapTransaction(
    usdtSwapQuoteDto: UsdtSwapQuoteDto,
  ): Promise<SwapTx> {
    try {
      const { fromAddress, amount } = usdtSwapQuoteDto;
      const tokenIn = process.env.WETH_ADDRESS!;
      const tokenOut = process.env.USDT_ADDRESS!;

      if (!tokenIn || !tokenOut) {
        throw new Error('Missing token address in env vars');
      }
      const poolAddress: string = await getPool(
        this.factoryContract,
        tokenIn,
        tokenOut,
      );

      this.logger.log('==== poolAddress ===', { poolAddress });

      if (!poolAddress || poolAddress === ethers.ZeroAddress) {
        throw new Error('Pool not found for token pair');
      }

      const poolContract: Contract = this.providerService.getContract(
        poolAddress,
        ETH_POOL_ABI,
        ChainEnum.ETH,
      );
      const fee: bigint = await getPoolContractFee(poolContract);
      this.logger.log('==== fee ===', { fee });

      const formattedAmountIn: bigint = parseEther(amount.toString());

      const quotedOutput: QuotedOutput = await quoteExactInputSingle(
        this.quoterContract,
        tokenIn,
        process.env.USDT_ADDRESS as string,
        fee,
        formattedAmountIn,
      );
      this.logger.log('==== quotedOutput ===', {
        quotedOutput,
      });
      const iface: Interface = this.swapRouterContract.interface;

      const data = iface.encodeFunctionData('exactInputSingle', [
        {
          tokenIn,
          tokenOut: process.env.USDT_ADDRESS,
          fee,
          recipient: fromAddress,
          deadline: Math.floor(Date.now() / 1000) + 600,
          amount,
          amountOutMinimum: quotedOutput.amountOut,
          sqrtPriceLimitX96: 0,
        },
      ]);
      this.logger.log('==== Iface data ===', {
        data,
      });
      const unsignedTx: SwapTx = {
        to: process.env.SWAP_ROUTER_ADDRESS as string,
        data,
        value: 0n,
        gasLimit: 300000n, // estimate better in prod
      };

      return unsignedTx;
    } catch (error: any) {
      throw new Error(`Failed to get swap quote: ${error.message}`);
    }
  }

  async getWalletAddressInfo(
    walletAddressDto: WalletAddressDto,
  ): Promise<{ transactionCount: number; gasFeeData: FeeData }> {
    const { walletAddress } = walletAddressDto;
    const [transactionCount, gasFeeData] = await Promise.all([
      getTransactionCount(this.provider, walletAddress),
      getFeeData(this.provider),
    ]);

    return {
      transactionCount,
      gasFeeData,
    };
  }

  async broadcastTransaction(
    broadcastTransactionDto: BroadcastTransactionDto,
  ): Promise<{ txHash: string; receipt: TransactionReceipt | null }> {
    try {
      const { signedTx } = broadcastTransactionDto;
      const txResponse: TransactionResponse = await this.provider.broadcastTransaction(signedTx);
      this.logger.log(`Broadcasted Tx: ${txResponse.hash}`);
      const receipt: TransactionReceipt | null = await txResponse.wait();
      this.logger.log(`Receipt: ${JSON.stringify(receipt)}`);
  
      return {
        txHash: txResponse.hash,
        receipt,
      };
    } catch (error) {
      this.logger.error('Broadcast error:', error);
      throw error;
    }
  }
  

  async estimateGas(
    to: string,
    from: string,
    data: string,
    txValue?: string | bigint,
  ): Promise<number> {
    try {
      const valueInBigInt = txValue
        ? typeof txValue === 'string'
          ? BigInt(txValue)
          : txValue
        : 0n;
      const estimated = await this.provider.estimateGas({
        to,
        data,
        value: valueInBigInt,
        from,
      });
      this.logger.log('==== estimated ===', { estimated });

      return Number((estimated * 130n) / 100n);
    } catch (error: any) {
      this.logger.warn(
        'Gas estimation failed, using fallback:',
        error?.message || error,
      );
      if (data.includes('0xa9059cbb') || data.includes('0x095ea7b3'))
        return 100000;
      if (to === process.env.SWAP_ROUTER_ADDRESS) return 400000;
      return 80000;
    }
  }

  async prepareSwapTransaction(
    swapPrepareDto:SwapQuoteDto,
  ): Promise<any> {
   return await this.uniSwapService.buildSwapTx(swapPrepareDto)
  }

  async executeSwapTransactions(
    txs: string[],   // array of signed tx strings
  ): Promise<any> {
    const txHashes: string[] = [];
  
    for (const signedTx of txs) {
      const txResponse = await this.provider.broadcastTransaction(signedTx);
      txHashes.push(txResponse.hash);
      await txResponse.wait();
    }
  
    return { txHashes };
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
          ETH_ERC20_ABI,
          ChainEnum.ETH,
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
      gasPrice: feeData?.maxFeePerGas,
      chainId: network.chainId,
    };
    return transaction;
  }

  getBalance(walletAddressDto: WalletAddressDto): Promise<bigint> {
    const { walletAddress } = walletAddressDto;
    return getNativeCurrencyBalance(walletAddress, this.provider);
  }
}
