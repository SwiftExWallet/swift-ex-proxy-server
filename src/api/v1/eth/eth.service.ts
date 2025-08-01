import { BadRequestException, Injectable } from '@nestjs/common';
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
@Injectable()
export class EthService {
  provider: JsonRpcProvider;
  factoryContract: Contract;
  quoterContract: Contract;
  swapRouterContract: Contract;
  constructor(private readonly providerService: ProviderService) {
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
    try {
      const { tokenIn, tokenOut, amount } = swapQuoteDto;
      const poolAddress: string = await getPool(
        this.factoryContract,
        tokenIn.address,
        tokenOut.address,
      );

      if (!poolAddress || poolAddress === ethers.ZeroAddress) {
        throw new Error('Pool not found for token pair');
      }

      const poolContract: Contract = this.providerService.getContract(
        poolAddress,
        ETH_POOL_ABI,
        ChainEnum.ETH,
      );
      const fee: bigint = await getPoolContractFee(poolContract);

      const formattedAmountIn: bigint = parseUnits(
        amount.toString(),
        tokenIn.decimals,
      );

      const quotedOutput: QuotedOutput = await quoteExactInputSingle(
        this.quoterContract,
        tokenIn.address,
        tokenOut.address,
        fee,
        formattedAmountIn,
      );

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

      if (!poolAddress || poolAddress === ethers.ZeroAddress) {
        throw new Error('Pool not found for token pair');
      }

      const poolContract: Contract = this.providerService.getContract(
        poolAddress,
        ETH_POOL_ABI,
        ChainEnum.ETH,
      );
      const fee: bigint = await getPoolContractFee(poolContract);

      const formattedAmountIn: bigint = parseEther(amount.toString());

      const quotedOutput: QuotedOutput = await quoteExactInputSingle(
        this.quoterContract,
        tokenIn,
        process.env.USDT_ADDRESS as string,
        fee,
        formattedAmountIn,
      );

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
  ): Promise<SwapTransaction[]> {
    const { address, swapType, value, depositData, approveData, swapData } =
      swapPrepareDto;
    const nonce: number = await getTransactionCount(this.provider, address);
    const { chainId } = await getNetwork(this.provider);

    const txs: SwapTransaction[] = [];
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
    const estimateGas = async (to: string, data: string, txValue?: string | bigint): Promise<number> => {
      try {
        const valueInBigInt = txValue ? (typeof txValue === 'string' ? BigInt(txValue) : txValue) : 0n;
        const estimated = await this.provider.estimateGas({
          to,
          data,
          value: valueInBigInt,
          from: address
        });

        return Number((estimated * 130n) / 100n);
      } catch (error: any) {
        console.warn('Gas estimation failed, using fallback:', error?.message || error);
        if (data.includes('0xa9059cbb') || data.includes('0x095ea7b3')) return 100000;
        if (to === process.env.SWAP_ROUTER_ADDRESS) return 400000;
        return 80000;
      }
    };
  
    if (swapType == EthSwapEnum.EthToUsdc) {
      const depositGas = await estimateGas(process.env.WETH, depositData, value);
      const approveGas = await estimateGas(process.env.WETH, approveData);
      const swapGas = await estimateGas(process.env.SWAP_ROUTER_ADDRESS as string, swapData);
  
      txs.push({
        to: process.env.WETH,
        data: depositData,
        value,
        gasLimit: depositGas,
        nonce,
        chainId,
        type: +process.env.ETH_SWAP_TYPE,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      txs.push({
        to: process.env.WETH,
        data: approveData,
        gasLimit: approveGas,
        nonce: nonce + 1,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      txs.push({
        to: process.env.SWAP_ROUTER,
        data: swapData,
        gasLimit: swapGas,
        nonce: nonce + 2,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
    } else if (swapType == EthSwapEnum.UsdcToWeth) {
      const approveGas = await estimateGas(process.env.USDC, approveData);
      const swapGas = await estimateGas(process.env.SWAP_ROUTER_ADDRESS as string, swapData);
  
      txs.push({
        to: process.env.USDC,
        data: approveData,
        gasLimit: approveGas,
        nonce,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      txs.push({
        to: process.env.SWAP_ROUTER,
        data: swapData,
        gasLimit: swapGas,
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
