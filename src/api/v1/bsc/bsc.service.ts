import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  FeeData,
  formatUnits,
  getAddress,
  Interface,
  parseEther,
  TransactionRequest,
  TransactionResponse,
} from 'ethers';
import { JsonRpcProvider, Contract } from 'ethers';

import {
  ResolvedSwapQuoteDto,
  SwapQuoteDto,
} from '../common/dto/swapQuote.dto';
import {
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
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { ProviderService } from '../provider/provider.service';
import { ChainEnum, SupportedWalletChain } from '../common/enums/chain.enum';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { FullTransaction } from '../common/interface/transaction.interface';
import { ValidateAddress } from '../common/helpers/utilityMethods';
import { getErc20ContractInfo } from '../common/helpers/contractUtilityMethod';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
import { UsdtBalanceDto } from './dto/usdtBalance.dto';
import { PancakeSwapService } from './pancake/bsc.pancake.service';
import {
  createProviderBadRequestException,
  ProviderErrorCode,
  throwIfHttpException,
} from '../common/utils/provider-error.util';
import { withProviderControls } from '../common/utils/retry.util';
import { TokenMetadataService } from '../common/services/tokenMetadata.service';
import {
  type Wallet,
  withExplicitVerifiedWalletAddress,
} from '../common/helpers/requestWallet';

@Injectable()
export class BscService {
  private readonly logger = new Logger(BscService.name);

  provider: JsonRpcProvider;
  routerContract: Contract;
  constructor(
    private readonly providerService: ProviderService,
    private readonly pancakeSwapService: PancakeSwapService,
    private readonly tokenMetadataService: TokenMetadataService,
  ) {
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

  private async withProviderControl<T>(
    action: string,
    operation: (attempt: number) => Promise<T>,
  ): Promise<T> {
    return withProviderControls(`bsc:service:${action}`, operation);
  }

  async getSwapQuote(
    swapQuoteDto: SwapQuoteDto | ResolvedSwapQuoteDto,
  ): Promise<string> {
    try {
      const resolvedDto =
        await this.tokenMetadataService.normalizeSwapQuote(swapQuoteDto);
      if (process.env.ENVIRONMENT === 'prod') {
        return await this.pancakeSwapService.getSwapQuote(resolvedDto);
      }
      const { tokenIn, tokenOut, amount } = resolvedDto;
      const path: [string, string] = [tokenIn.address, tokenOut.address];

      const amountIn: bigint = parseEther(amount);
      const amountsOut: bigint[] = (await this.withProviderControl(
        'router-amounts-out',
        () => this.routerContract.getAmountsOut(amountIn, path),
      )) as bigint[];

      return formatUnits(amountsOut[1], tokenIn.decimals);
    } catch (error: any) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async prepareSwapTransaction(
    prepareSwapTransactionDto: SwapQuoteDto | ResolvedSwapQuoteDto,
    verifiedWallet?: Wallet,
  ): Promise<any> {
    try {
      const resolvedDto = verifiedWallet
        ? await this.normalizeSwapQuoteForWallet(
            prepareSwapTransactionDto,
            verifiedWallet,
          )
        : (prepareSwapTransactionDto as ResolvedSwapQuoteDto);
      if (process.env.ENVIRONMENT === 'prod') {
        return await this.pancakeSwapService.createUnsignedSwapTransaction(
          resolvedDto,
        );
      }

      const { recipient, tokenIn, tokenOut, amount } = resolvedDto;
      const path: [string, string] = [
        getAddress(tokenIn.address),
        getAddress(tokenOut.address),
      ];

      const amountIn: bigint = parseEther(amount);

      const amountsOut: bigint[] = (await this.withProviderControl(
        'router-amounts-out',
        () => this.routerContract.getAmountsOut(amountIn, path),
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
        recipient,
        deadline,
      ]);

      const nonce: number = await getTransactionCount(this.provider, recipient);
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
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async broadcastTransaction(
    broadcastTransactionDto: BroadcastTransactionDto,
  ): Promise<any> {
    try {
      const { signedTx, signedTransactions } = broadcastTransactionDto;

      const txArray: string[] = signedTransactions
        ? signedTransactions
        : signedTx
          ? [signedTx]
          : [];

      if (txArray.length === 0) {
        throw new BadRequestException('No signed transaction provided');
      }

      this.logger.log(`Broadcasting ${txArray.length} transaction(s)`);

      interface BroadcastResult {
        transactionHash: string;
        type: string;
        status: string;
      }

      const results: BroadcastResult[] = [];

      for (let i = 0; i < txArray.length; i++) {
        const signedTransaction = txArray[i];

        this.logger.log(`Broadcasting transaction ${i + 1}/${txArray.length}`);

        const txResponse: TransactionResponse = await this.withProviderControl(
          'broadcast',
          () => this.provider.broadcastTransaction(signedTransaction),
        );

        this.logger.log(`Transaction ${i + 1} broadcasted: ${txResponse.hash}`);

        results.push({
          transactionHash: txResponse.hash,
          type: i === 0 && txArray.length > 1 ? 'approve' : 'transfer',
          status: 'pending',
        });
      }

      if (signedTx && !signedTransactions) {
        return {
          txHash: results[0].transactionHash,
          receipt: null,
        };
      }

      return {
        success: true,
        totalTransactions: txArray.length,
        results,
      };
    } catch (error) {
      this.logger.error('Broadcast error:', error);
      throwIfHttpException(error);
      throw createProviderBadRequestException(
        error,
        ProviderErrorCode.TransactionRejected,
      );
    }
  }

  async getUsdtTokenBalance(
    usdtBalanceDto: UsdtBalanceDto,
    verifiedWallet?: Wallet,
  ): Promise<{ walletBalance: bigint; tokenBalance: bigint }> {
    try {
      const { walletAddress, tokenAddress } = verifiedWallet
        ? withExplicitVerifiedWalletAddress(
            usdtBalanceDto,
            verifiedWallet,
            'walletAddress',
            SupportedWalletChain.bnb,
          )
        : usdtBalanceDto;
      const walletAddressDto: WalletAddressDto = {
        walletAddress: walletAddress as string,
      };
      const [walletBalance, tokenBalance] = await Promise.all([
        this.getBalance(walletAddressDto),
        getErc20ContractTokenBalance(
          tokenAddress,
          walletAddress as string,
          this.provider,
        ),
      ]);

      return { walletBalance, tokenBalance };
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async getBalance(
    walletAddressDto: WalletAddressDto,
    verifiedWallet?: Wallet,
  ): Promise<bigint> {
    try {
      const { walletAddress } = verifiedWallet
        ? withExplicitVerifiedWalletAddress(
            walletAddressDto,
            verifiedWallet,
            'walletAddress',
            SupportedWalletChain.bnb,
          )
        : walletAddressDto;
      return await getNativeCurrencyBalance(walletAddress, this.provider);
    } catch (error) {
      throw createProviderBadRequestException(error);
    }
  }

  async getWalletAddressInfo(
    walletAddressDto: WalletAddressDto,
    verifiedWallet?: Wallet,
  ): Promise<{ transactionCount: number; gasFeeData: FeeData }> {
    try {
      const { walletAddress } = verifiedWallet
        ? withExplicitVerifiedWalletAddress(
            walletAddressDto,
            verifiedWallet,
            'walletAddress',
            SupportedWalletChain.bnb,
          )
        : walletAddressDto;
      const [transactionCount, gasFeeData] = await Promise.all([
        getTransactionCount(this.provider, walletAddress),
        getFeeData(this.provider),
      ]);

      return {
        transactionCount,
        gasFeeData,
      };
    } catch (error) {
      throw createProviderBadRequestException(error);
    }
  }

  async getTokenInfo(
    getTokenInfoDto: GetTokenInfoDto,
    verifiedWallet?: Wallet,
  ): Promise<TokenInfo[]> {
    try {
      const { addresses, walletAddress } = verifiedWallet
        ? withExplicitVerifiedWalletAddress(
            getTokenInfoDto,
            verifiedWallet,
            'walletAddress',
            SupportedWalletChain.bnb,
          )
        : getTokenInfoDto;
      const validAddresses: string[] = ValidateAddress(addresses);

      if (validAddresses.length === 0) {
        throw new BadRequestException('No valid token addresses provided');
      }

      const tokenInfos = await Promise.all(
        validAddresses.map(async (address) => {
          const tokenContract: Contract = this.providerService.getContract(
            address,
            BSC_IMPORT_TOKEN_ABI,
            ChainEnum.BSC,
          );
          const { name, symbol, decimals, balance } =
            await getErc20ContractInfo(tokenContract, walletAddress);

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
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async prepareTransaction(
    prepareTransactionDto: PrepareTransactionDto,
    verifiedWallet?: Wallet,
  ): Promise<FullTransaction> {
    try {
      const { unsignedTx, walletAddress } = verifiedWallet
        ? withExplicitVerifiedWalletAddress(
            prepareTransactionDto,
            verifiedWallet,
            'walletAddress',
            SupportedWalletChain.bnb,
          )
        : prepareTransactionDto;
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
    } catch (error) {
      throw createProviderBadRequestException(error);
    }
  }

  private async normalizeSwapQuoteForWallet(
    dto: SwapQuoteDto | ResolvedSwapQuoteDto,
    verifiedWallet: Wallet,
  ): Promise<ResolvedSwapQuoteDto> {
    return await this.tokenMetadataService.normalizeSwapQuote(
      withExplicitVerifiedWalletAddress(
        dto,
        verifiedWallet,
        'recipient',
        SupportedWalletChain.bnb,
      ),
    );
  }
}
