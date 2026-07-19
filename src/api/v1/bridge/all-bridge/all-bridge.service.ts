import {
  AllbridgeCoreSdk,
  ChainDetailsMap,
  FeePaymentMethod,
  Messenger,
  RawTransaction,
} from '@allbridge/bridge-core-sdk';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ValidPayFeeType,
  ValidWalletType,
} from '../../common/enums/all-bridge.enum';
import { AllBridgeSwapADto } from './dto/all-bridge-swap.dto';
import { AllBridgeQuotesDto } from './dto/all-bridge-swap-quotes.dto';
import {
  getEstimateGas,
  getFeeData,
  getNetwork,
  getTransactionCount,
} from '../../common/helpers/blockchainUtilityMethods';
import { FeeData, JsonRpcProvider } from 'ethers';
import { ProviderService } from '../../provider/provider.service';
import { ChainEnum } from '../../common/enums/chain.enum';

@Injectable()
export class AllBridgeService {
  private readonly logger = new Logger(AllBridgeService.name);
  private sdk: AllbridgeCoreSdk;
  getProvider(chain: ChainEnum): JsonRpcProvider {
    return this.rpcService.getProvider(chain);
  }
  constructor(private readonly rpcService: ProviderService) {
    this.sdk = new AllbridgeCoreSdk({
      ETH: this.rpcService.getChainRpcUrl(ChainEnum.ETH),
      BSC: this.rpcService.getChainRpcUrl(ChainEnum.BSC),
      POL: this.rpcService.getChainRpcUrl(ChainEnum.POL),
      ARB: this.rpcService.getChainRpcUrl(ChainEnum.ARB),
      BAS: this.rpcService.getChainRpcUrl(ChainEnum.BASE),
      AVA: this.rpcService.getChainRpcUrl(ChainEnum.AVAX),
      OPT: this.rpcService.getChainRpcUrl(ChainEnum.OP),
    });
  }

  private async fetchTokens(sourceToken: string, walletType: ValidWalletType) {
    const chains: ChainDetailsMap = await this.sdk.chainDetailsMap();
    const { tokens } = chains[walletType];
    return tokens.find((token) => token.symbol === sourceToken);
  }

  async prepareTransaction(swapDto: AllBridgeSwapADto) {
    try {
      const {
        fromAddress,
        toAddress,
        amount,
        sourceToken,
        destinationToken,
        walletType,
        feePayType,
        destinationWalletType,
      } = swapDto;

      const sourceTokenCoin = await this.fetchTokens(sourceToken, walletType);
      const destinationTokenCoin = await this.fetchTokens(
        destinationToken,
        destinationWalletType,
      );

      if (!sourceTokenCoin || !destinationTokenCoin) {
        throw new BadRequestException(
          'Either invalid source or destination token',
        );
      }

      const needsApproval = !(await this.sdk.bridge.checkAllowance({
        token: sourceTokenCoin,
        owner: fromAddress,
        amount: amount,
      }));

      const transferTransaction: RawTransaction =
        await this.sdk.bridge.rawTxBuilder.send({
          amount: amount,
          fromAccountAddress: fromAddress,
          toAccountAddress: toAddress,
          sourceToken: sourceTokenCoin,
          destinationToken: destinationTokenCoin,
          messenger: Messenger.ALLBRIDGE,
          gasFeePaymentMethod:
            feePayType === ValidPayFeeType.WITH_NATIVE_CURRENCY
              ? FeePaymentMethod.WITH_NATIVE_CURRENCY
              : FeePaymentMethod.WITH_STABLECOIN,
        });

      if (needsApproval) {
        this.logger.log(
          '=== preparing both approve and transfer transactions ===',
        );

        const approveTransaction: RawTransaction =
          await this.sdk.bridge.rawTxBuilder.approve({
            token: sourceTokenCoin,
            owner: fromAddress,
          });

        await this.simulateTransaction(
          fromAddress,
          approveTransaction,
          'approve',
          walletType,
        );

        const currentNonce = await getTransactionCount(
          this.getProvider(ChainEnum[walletType]),
          fromAddress,
        );
        const [network, feeData] = await Promise.all([
          getNetwork(this.getProvider(ChainEnum[walletType])),
          getFeeData(this.getProvider(ChainEnum[walletType])),
        ]);
        const bufferedFeeData = this.bufferFeeData(feeData);
        const approveGasLimit = await getEstimateGas(
          this.getProvider(ChainEnum[walletType]),
          fromAddress,
          approveTransaction,
        );
        const approveTxMeta = {
          nonce: currentNonce,
          gasLimit: approveGasLimit,
          feeData: bufferedFeeData,
          network: network,
        };

        const transferTxMeta = {
          nonce: currentNonce + 1,
          gasLimit: BigInt(350000),
          feeData: feeData,
          network: network,
        };

        return {
          needsApproval: true,
          transactions: [
            {
              transaction: approveTransaction,
              txMeta: approveTxMeta,
              type: 'approve',
            },
            {
              transaction: transferTransaction,
              txMeta: transferTxMeta,
              type: 'transfer',
            },
          ],
        };
      }

      this.logger.log('=== preparing only transfer transaction ===');

      await this.simulateTransaction(
        fromAddress,
        transferTransaction,
        'transfer',
        walletType,
      );

      const [nonce, gasLimit, feeData, network] = await Promise.all([
        getTransactionCount(
          this.getProvider(ChainEnum[walletType]),
          fromAddress,
        ),
        getEstimateGas(
          this.getProvider(ChainEnum[walletType]),
          fromAddress,
          transferTransaction,
        ),
        getFeeData(this.getProvider(ChainEnum[walletType])),
        getNetwork(this.getProvider(ChainEnum[walletType])),
      ]);

      const txMeta = {
        nonce: nonce,
        gasLimit: gasLimit,
        feeData: this.bufferFeeData(feeData),
        network: network,
      };

      return {
        needsApproval: false,
        transactions: [
          {
            transaction: transferTransaction,
            txMeta: txMeta,
            type: 'transfer',
          },
        ],
      };
    } catch (error) {
      this.logger.error('Error in swap prepare:', error);
      const message =
        error.info?.error?.message ||
        error.shortMessage ||
        error.message ||
        'Transaction preparation failed';

      throw new BadRequestException(message);
    }
  }

  async getSwapDetails(allBridgeQuotes: AllBridgeQuotesDto): Promise<{
    conversionRate: string;
    minimumAmountOut: string;
    slippageTolerance: string;
    fee: object;
    completionTime: number;
    sourceChain: string;
    sourceToken: string;
    destinationChain: string;
    destinationToken: string;
  }> {
    try {
      const chains = await this.sdk.chainDetailsMap();
      const sourceChain = chains[allBridgeQuotes.sourceChain];
      const destinationChain = chains[allBridgeQuotes.destinationChain];
      if (!sourceChain || !destinationChain) {
        throw new NotFoundException('Chain details not found');
      }

      const sourceToken = sourceChain.tokens.find(
        (token) => token.symbol === allBridgeQuotes.sourceToken,
      );
      const destinationToken = destinationChain.tokens.find(
        (token) => token.symbol === allBridgeQuotes.destinationToken,
      );

      if (!sourceToken || !destinationToken) {
        throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
      }

      const minimumReceiveAmount = await this.sdk.getAmountToBeReceived(
        allBridgeQuotes.amount,
        sourceToken,
        destinationToken,
        Messenger.ALLBRIDGE,
      );
      this.logger.log('===minimumReceiveAmount ==', minimumReceiveAmount);

      const { gasFeeOptions } =
        await this.sdk.getAmountToBeReceivedAndGasFeeOptions(
          allBridgeQuotes.amount,
          sourceToken,
          destinationToken,
          Messenger.ALLBRIDGE,
        );

      const feeObj = {
        native: {
          amount: gasFeeOptions.native.float,
          symbol: sourceChain.chainSymbol || 'Native',
        },
        stablecoin: {
          amount: gasFeeOptions?.stablecoin?.float || '0',
          symbol: sourceToken.symbol,
        },
      };

      const transferTimeMs =
        this.sdk.getAverageTransferTime(
          sourceToken,
          destinationToken,
          Messenger.ALLBRIDGE,
        ) ?? 0;

      const conversionRate = (
        parseFloat(minimumReceiveAmount) / parseFloat(allBridgeQuotes.amount)
      ).toFixed(12);

      const slippageTolerance = process.env.SLIPPAGE_TOLERANCE as string;
      return {
        conversionRate,
        minimumAmountOut: minimumReceiveAmount,
        slippageTolerance,
        fee: feeObj,
        completionTime: transferTimeMs,
        sourceChain: allBridgeQuotes.sourceChain,
        sourceToken: allBridgeQuotes.sourceToken,
        destinationChain: allBridgeQuotes.destinationChain,
        destinationToken: allBridgeQuotes.destinationToken,
      };
    } catch (error) {
      this.logger.error('Error in getSwapDetails:', error);
      const message =
        error.info?.error?.message ||
        error.shortMessage ||
        error.message ||
        'Failed to get swap details.';

      throw new BadRequestException(message);
    }
  }

  private async simulateTransaction(
    fromAddress: string,
    rawTx: RawTransaction,
    label: string = 'transaction',
    sourceChain: string,
  ): Promise<void> {
    try {
      this.logger.log(`=== Simulating ${label} ===`);
      await this.getProvider(ChainEnum[sourceChain]).call({
        from: fromAddress,
        to: (rawTx as any).to,
        data: (rawTx as any).data,
        value: (rawTx as any).value ?? 0n,
      });
      this.logger.log(`=== ${label} simulation passed ===`);
    } catch (error) {
      const revertReason =
        error?.revert?.args?.[0] ||
        error?.reason ||
        error?.info?.error?.message ||
        error?.shortMessage ||
        error?.message ||
        `${label} simulation failed`;

      this.logger.error(`=== ${label} simulation FAILED: ${revertReason} ===`);
      throw new BadRequestException(revertReason);
    }
  }

  private bufferFeeData(feeData: FeeData, bufferPercent = 25): FeeData {
    const bump = (value: bigint | null, pct: number): bigint | null => {
      if (value == null) return null;
      return (value * BigInt(100 + pct)) / 100n;
    };

    return {
      ...feeData,
      maxFeePerGas: bump(feeData.maxFeePerGas, bufferPercent),
      maxPriorityFeePerGas: bump(feeData.maxPriorityFeePerGas, bufferPercent),
      // gasPrice is legacy (pre-EIP-1559), bump it too for non-EIP-1559 chains
      gasPrice: bump(feeData.gasPrice, bufferPercent),
    } as FeeData;
  }
}
