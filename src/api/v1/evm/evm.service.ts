import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Contract,
  FeeData,
  formatUnits,
  JsonRpcProvider,
  TransactionResponse,
} from 'ethers';
import { ETH_ERC20_ABI } from '../common/abi/eth';
import { BroadcastTransactionDto } from '../common/dto/broadcastTransaction.dto';
import { GetTokenInfoDto } from '../common/dto/fetchTokenInfo.dto';
import { PrepareTransactionDto } from '../common/dto/prepareTransaction.dto';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';
import { ChainEnum, SupportedWalletChain } from '../common/enums/chain.enum';
import {
  getErc20ContractTokenBalance,
  getEstimateGas,
  getFeeData,
  getNativeCurrencyBalance,
  getNetwork,
  getTransactionCount,
} from '../common/helpers/blockchainUtilityMethods';
import { getErc20ContractInfo } from '../common/helpers/contractUtilityMethod';
import {
  type Wallet,
  withExplicitVerifiedWalletAddress,
} from '../common/helpers/requestWallet';
import { ValidateAddress } from '../common/helpers/utilityMethods';
import { FullTransaction } from '../common/interface/transaction.interface';
import { TokenInfo } from '../common/interface/tokenInfo.interface';
import {
  createProviderBadRequestException,
  ProviderErrorCode,
  throwIfHttpException,
} from '../common/utils/provider-error.util';
import { withProviderControls } from '../common/utils/retry.util';
import { ProviderService } from '../provider/provider.service';
import { QuoterService } from '../quoter/quoter.service';
import { UniswapService } from '../swap/uniswap/uniswap.service';

type TokenBalanceDto = WalletAddressDto & { tokenAddress: string };

type BroadcastResult = {
  transactionHash: string;
  type: string;
  status: string;
};

const EVM_CHAIN_BY_PARAM: Record<string, ChainEnum> = {
  eth: ChainEnum.ETH,
  bsc: ChainEnum.BSC,
  bnb: ChainEnum.BSC,
  pol: ChainEnum.POL,
  matic: ChainEnum.POL,
  arb: ChainEnum.ARB,
  opt: ChainEnum.OP,
  op: ChainEnum.OP138,
  op138: ChainEnum.OP138,
  avax: ChainEnum.AVAX,
  ava: ChainEnum.AVAX,
  base: ChainEnum.BASE,
  bas: ChainEnum.BASE,
  gnosis: ChainEnum.GNO,
  gno: ChainEnum.GNO,
  zksync: ChainEnum.ZK,
  zk: ChainEnum.ZK,
  linea: ChainEnum.LINEA,
  sonic: ChainEnum.SONIC,
  unichain: ChainEnum.UNI,
  uni: ChainEnum.UNI,
};

@Injectable()
export class EvmService {
  constructor(
    private readonly providerService: ProviderService,
    private readonly quoterService: QuoterService,
    private readonly uniswapService: UniswapService,
  ) {}

  private resolveChain(chain: string): ChainEnum {
    const resolved =
      EVM_CHAIN_BY_PARAM[
        String(chain ?? '')
          .trim()
          .toLowerCase()
      ];

    if (!resolved) {
      throw new BadRequestException('Unsupported EVM chain');
    }

    return resolved;
  }

  private provider(chain: string): JsonRpcProvider {
    return this.providerService.getProvider(this.resolveChain(chain));
  }

  private withVerifiedWallet<T extends Record<string, any>>(
    dto: T,
    verifiedWallet?: Wallet,
  ): T {
    return verifiedWallet
      ? withExplicitVerifiedWalletAddress(
          dto,
          verifiedWallet,
          'walletAddress',
          SupportedWalletChain.multi,
        )
      : dto;
  }

  private async withProviderControl<T>(
    chain: ChainEnum,
    action: string,
    operation: (attempt: number) => Promise<T>,
  ): Promise<T> {
    return withProviderControls(`evm:${chain}:${action}`, operation);
  }

  async getBalance(
    chain: string,
    walletAddressDto: WalletAddressDto,
    verifiedWallet?: Wallet,
  ): Promise<bigint> {
    try {
      const { walletAddress } = this.withVerifiedWallet(
        walletAddressDto,
        verifiedWallet,
      );
      return await getNativeCurrencyBalance(
        walletAddress,
        this.provider(chain),
      );
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async getWalletAddressInfo(
    chain: string,
    walletAddressDto: WalletAddressDto,
    verifiedWallet?: Wallet,
  ): Promise<{ transactionCount: number; gasFeeData: FeeData }> {
    try {
      const provider = this.provider(chain);
      const { walletAddress } = this.withVerifiedWallet(
        walletAddressDto,
        verifiedWallet,
      );
      const [transactionCount, gasFeeData] = await Promise.all([
        getTransactionCount(provider, walletAddress),
        getFeeData(provider),
      ]);

      return { transactionCount, gasFeeData };
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async getTokenBalance(
    chain: string,
    tokenBalanceDto: TokenBalanceDto,
    verifiedWallet?: Wallet,
  ): Promise<{ walletBalance: bigint; tokenBalance: bigint }> {
    try {
      const provider = this.provider(chain);
      const { walletAddress, tokenAddress } = this.withVerifiedWallet(
        tokenBalanceDto,
        verifiedWallet,
      );
      const validTokenAddress = ValidateAddress(tokenAddress)[0];

      if (!validTokenAddress) {
        throw new BadRequestException('No valid token addresses provided');
      }

      const [walletBalance, tokenBalance] = await Promise.all([
        getNativeCurrencyBalance(walletAddress, provider),
        getErc20ContractTokenBalance(
          validTokenAddress,
          walletAddress,
          provider,
        ),
      ]);

      return { walletBalance, tokenBalance };
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async getTokenInfo(
    chain: string,
    getTokenInfoDto: GetTokenInfoDto,
    verifiedWallet?: Wallet,
  ): Promise<TokenInfo[]> {
    try {
      const resolvedChain = this.resolveChain(chain);
      const { addresses, walletAddress } = this.withVerifiedWallet(
        getTokenInfoDto,
        verifiedWallet,
      );
      const validAddresses = ValidateAddress(addresses);

      if (validAddresses.length === 0) {
        throw new BadRequestException('No valid token addresses provided');
      }

      return await Promise.all(
        validAddresses.map(async (address) => {
          const tokenContract: Contract = this.providerService.getContract(
            address,
            ETH_ERC20_ABI,
            resolvedChain,
          );
          const { name, symbol, decimals, balance } =
            await getErc20ContractInfo(tokenContract, walletAddress);

          return {
            name,
            symbol,
            balance: formatUnits(balance, decimals),
            address,
            imageUrl: '',
            decimals,
          };
        }),
      );
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async prepareTransaction(
    chain: string,
    prepareTransactionDto: PrepareTransactionDto,
    verifiedWallet?: Wallet,
  ): Promise<FullTransaction> {
    try {
      const provider = this.provider(chain);
      const { unsignedTx, walletAddress } = this.withVerifiedWallet(
        prepareTransactionDto,
        verifiedWallet,
      );
      const [nonce, gasLimit, feeData, network] = await Promise.all([
        getTransactionCount(provider, walletAddress),
        getEstimateGas(provider, walletAddress, unsignedTx),
        getFeeData(provider),
        getNetwork(provider),
      ]);

      return {
        unsignedTx,
        nonce,
        gasLimit,
        gasPrice: feeData?.maxFeePerGas ?? feeData?.gasPrice ?? null,
        chainId: network.chainId,
      };
    } catch (error) {
      throwIfHttpException(error);
      throw createProviderBadRequestException(error);
    }
  }

  async broadcastTransaction(
    chain: string,
    broadcastTransactionDto: BroadcastTransactionDto,
  ): Promise<any> {
    try {
      const resolvedChain = this.resolveChain(chain);
      const provider = this.providerService.getProvider(resolvedChain);
      const { signedTx, signedTransactions } = broadcastTransactionDto;
      const txArray = signedTransactions
        ? signedTransactions
        : signedTx
          ? [signedTx]
          : [];

      if (txArray.length === 0) {
        throw new BadRequestException('No signed transaction provided');
      }

      const results: BroadcastResult[] = [];

      for (let i = 0; i < txArray.length; i++) {
        const txResponse: TransactionResponse = await this.withProviderControl(
          resolvedChain,
          'broadcast',
          () => provider.broadcastTransaction(txArray[i]),
        );

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
      throwIfHttpException(error);
      throw createProviderBadRequestException(
        error,
        ProviderErrorCode.TransactionRejected,
      );
    }
  }

  async getSwapQuote(
    swapQuoteDto: SwapQuoteDto,
    verifiedWallet?: Wallet,
  ): Promise<any> {
    return await this.quoterService.getQuoteResponse(
      swapQuoteDto,
      verifiedWallet,
    );
  }

  async prepareSwapTransaction(
    swapQuoteDto: SwapQuoteDto,
    verifiedWallet?: Wallet,
  ): Promise<any> {
    return await this.uniswapService.buildSwapResponse(
      swapQuoteDto,
      verifiedWallet,
    );
  }
}
