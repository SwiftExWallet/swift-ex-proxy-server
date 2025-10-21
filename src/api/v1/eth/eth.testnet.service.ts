import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {formatUnits, parseUnits, ZeroAddress} from 'ethers';
import { JsonRpcProvider, Contract } from 'ethers';
import {ETH_FACTORY_ABI,ETH_POOL_ABI,ETH_QUOTER_ABI,} from '../common/abi/eth';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { ProviderService } from '../provider/provider.service';
import { ChainEnum } from '../common/enums/chain.enum';
import {QuotedOutput,SwapQuote, SwapTransaction,} from '../common/interface/swap.interface';
import {getPool,getPoolContractFee,quoteExactInputSingle,} from '../common/helpers/contractUtilityMethod';
import { SwapPrepareDto } from './dto/swapPrepare.dto';
import { getFeeData, getNetwork, getTransactionCount } from '../common/helpers/blockchainUtilityMethods';
import { EthSwapEnum } from '../common/enums/ethSwap.enum';
@Injectable()
export class EthTestnetSwapService {
  private readonly logger = new Logger(EthTestnetSwapService.name);

  provider: JsonRpcProvider;
  factoryContract: Contract;
  quoterContract: Contract;
  swapRouterContract: Contract;
  constructor(
    private readonly providerService: ProviderService,
  ) {
    const factoryAddress = process.env.POOL_FACTORY_CONTRACT_ADDRESS;
    const quoterAddress = process.env.QUOTER_CONTRACT_ADDRESS;

    if (!factoryAddress || !quoterAddress) {
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

  async getQuote(swapQuoteDto: SwapQuoteDto): Promise<SwapQuote> {
try {
      const { tokenIn, tokenOut, amount } = swapQuoteDto;
      const poolAddress: string = await getPool(
        this.factoryContract,
        tokenIn.address,
        tokenOut.address,
      );
      this.logger.log('==== poolAddress ===', { poolAddress });
      if (!poolAddress || poolAddress === ZeroAddress) {
        throw new Error('Pool not found for token pair');
      }

      const poolContract: Contract = this.providerService.getContract(
        poolAddress,
        ETH_POOL_ABI,
        ChainEnum.ETH,
      );
      const fee: bigint = await getPoolContractFee(poolContract);
      this.logger.log('==== fee ===', { fee });

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

      this.logger.log('==== quotedOutput ===', {
        quotedOutput,
      });
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

async prepareSwapTransaction(
    swapPrepareDto: SwapPrepareDto,
  ): Promise<SwapTransaction[]> {
    const { address, swapType, value, depositData, approveData, swapData } =
      swapPrepareDto;
    const nonce: number = await getTransactionCount(this.provider, address);
    const { chainId } = await getNetwork(this.provider);
    this.logger.log('==== nonce, chainId ===', { nonce, chainId });

    const txs: SwapTransaction[] = [];
    const { maxFeePerGas, maxPriorityFeePerGas } = await getFeeData(
      this.provider,
    );
    this.logger.log('====maxFeePerGas, maxPriorityFeePerGas  ===', {
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    if (
      !process.env.WETH_ADDRESS ||
      !process.env.ETH_SWAP_GAS_FEE_LIMIT ||
      !process.env.ETH_SWAP_TYPE ||
      !process.env.USDC_ADDRESS ||
      !process.env.SWAP_ROUTER_ADDRESS ||
      !maxFeePerGas ||
      !maxPriorityFeePerGas
    ) {
      throw new Error('Missing swap variable in environment variables');
    }
    this.logger.log('==== swapType ===', { swapType });

    if (swapType == EthSwapEnum.EthToUsdc) {
      const depositGas = await this.estimateGas(
        process.env.WETH_ADDRESS,
        address,
        depositData,
        value,
      );
      const approveGas = await this.estimateGas(
        process.env.WETH_ADDRESS,
        address,
        approveData,
      );
      const swapGas = await this.estimateGas(
        process.env.SWAP_ROUTER_ADDRESS as string,
        address,
        swapData,
      );
      this.logger.log('==== gases ===', { depositGas, approveGas, swapGas });

      txs.push({
        to: process.env.WETH_ADDRESS,
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
        to: process.env.WETH_ADDRESS,
        data: approveData,
        gasLimit: approveGas,
        nonce: nonce + 1,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      txs.push({
        to: process.env.SWAP_ROUTER_ADDRESS,
        data: swapData,
        gasLimit: swapGas,
        nonce: nonce + 2,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
    } else if (swapType == EthSwapEnum.UsdcToWeth) {
      const approveGas = await this.estimateGas(
        process.env.USDC_ADDRESS,
        address,
        approveData,
      );
      const swapGas = await this.estimateGas(
        process.env.SWAP_ROUTER_ADDRESS as string,
        address,
        swapData,
      );
      this.logger.log('==== gases ===', {
        approveGas,
        swapGas,
      });

      txs.push({
        to: process.env.USDC_ADDRESS,
        data: approveData,
        gasLimit: approveGas,
        nonce,
        chainId,
        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      txs.push({
        to: process.env.SWAP_ROUTER_ADDRESS,
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
}