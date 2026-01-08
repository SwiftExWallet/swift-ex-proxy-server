import {
    AllbridgeCoreSdk,
    ChainDetailsMap,
    ChainSymbol,
    ChainType,
    FeePaymentMethod,
    Messenger,
    TokenWithChainDetails,
  } from '@allbridge/bridge-core-sdk';
  import {
    BadRequestException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    NotFoundException,
  } from '@nestjs/common';
  import { ValidPayFeeType, ValidWalletType } from '../../common/enums/all-bridge.enum';
  import { AllBridgeSwapADto } from './dto/all-bridge-swap.dto';
  import { AllBridgeQuotesDto } from './dto/all-bridge-swap-quotes.dto';
  import {
    getEstimateGas,
    getFeeData,
    getNetwork,
    getTransactionCount,
  } from '../../common/helpers/blockchainUtilityMethods';
  import { JsonRpcProvider } from 'ethers';
  
  @Injectable()
  export class AllBridgeBscService {
    private readonly logger = new Logger(AllBridgeBscService.name);
    provider: JsonRpcProvider;
    private sdk: AllbridgeCoreSdk;
  
    constructor() {
      this.provider = new JsonRpcProvider(process.env.PROVIDER_RPC_BSC);
      this.sdk = new AllbridgeCoreSdk({
        BSC: process.env.PROVIDER_RPC_BSC as string,
      });
    }
  
    private async fetchTokens(sourceToken: string, walletType?: ValidWalletType) {
      // Stellar special case
      if (!walletType) {
        return {
          symbol: 'USDC',
          poolAddress: 'CAOTMWRKNMV5GWSVOMWCTCM5ZZFEQFUSWNLCZXA2KAXD4YG5A4DIPNFT',
          tokenAddress: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
          decimals: 7,
          name: 'USDC',
          originTokenAddress: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          feeShare: '0.0015',
          chainSymbol: ChainSymbol.STLR,
          chainType: ChainType.SRB,
          allbridgeChainId: 7,
          bridgeAddress: 'CBQ6GW7QCFFE252QEVENUNG45KYHHBRO4IZIWFJOXEFANHPQUXX5NFWV',
        } as TokenWithChainDetails;
      }
  
      const chains: ChainDetailsMap = await this.sdk.chainDetailsMap();
      const chainMap: Record<ValidWalletType, ChainSymbol> = {
        [ValidWalletType.ETH]: ChainSymbol.ETH,
        [ValidWalletType.BNB]: ChainSymbol.BSC,
      };
  
      const chainSymbol = chainMap[walletType];
      if (!chainSymbol) {
        throw new Error(`Unsupported wallet type: ${walletType}`);
      }
      const { tokens } = chains[chainSymbol];
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
        } = swapDto;
  
        const sourceTokenCoin = await this.fetchTokens(sourceToken, walletType);
        const destinationTokenCoin = await this.fetchTokens(destinationToken);
  
        if (!sourceTokenCoin || !destinationTokenCoin) {
          throw new BadRequestException('Invalid source or destination token');
        }
  
        this.logger.log('===tokens ==', { sourceTokenCoin, destinationTokenCoin });
  
        // Check allowance
        if (
          !(await this.sdk.bridge.checkAllowance({
            token: sourceTokenCoin,
            owner: fromAddress,
            amount: amount,
          }))
        ) {
          this.logger.log('=== preparing approve transaction ===');
  
          const transaction = await this.sdk.bridge.rawTxBuilder.approve({
            token: sourceTokenCoin,
            owner: fromAddress,
          });
  
          const [nonce, gasLimit, feeData, network] = await Promise.all([
            getTransactionCount(this.provider, fromAddress),
            getEstimateGas(this.provider, fromAddress, transaction),
            getFeeData(this.provider),
            getNetwork(this.provider),
          ]);
  
          return { transaction, txMeta: { nonce, gasLimit, feeData, network }, type: 'approve' };
        }
  
        this.logger.log('=== preparing transfer transaction ===');
  
        const transaction = await this.sdk.bridge.rawTxBuilder.send({
          amount,
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
  
        const [nonce, gasLimit, feeData, network] = await Promise.all([
          getTransactionCount(this.provider, fromAddress),
          getEstimateGas(this.provider, fromAddress, transaction),
          getFeeData(this.provider),
          getNetwork(this.provider),
        ]);
  
        return { transaction, txMeta: { nonce, gasLimit, feeData, network }, type: 'transfer' };
      } catch (error) {
        this.logger.error('Error in swap prepare:', error);
        throw new BadRequestException(error.message);
      }
    }
  
    async getSwapDetails(allBridgeQuotes: AllBridgeQuotesDto) {
      try {
        const chains = await this.sdk.chainDetailsMap();
        const { chainType, amount } = allBridgeQuotes;
  
        const sourceChain =
          chainType === ValidWalletType.ETH ? chains[ChainSymbol.ETH] : chains[ChainSymbol.BSC];
        const destinationChain = chains[ChainSymbol.SRB];
  
        if (!sourceChain || !destinationChain) {
          throw new NotFoundException('Chain details not found');
        }
  
        const sourceToken = sourceChain.tokens.find(
          (token) => token.symbol === allBridgeQuotes.sourceToken,
        );
        const destinationToken = destinationChain.tokens.find((token) => token.symbol === 'USDC');
  
        if (!sourceToken || !destinationToken) {
          throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
        }
  
        const minimumReceiveAmount = await this.sdk.getAmountToBeReceived(
          amount,
          sourceToken,
          destinationToken,
          Messenger.ALLBRIDGE,
        );
  
        const { gasFeeOptions } = await this.sdk.getAmountToBeReceivedAndGasFeeOptions(
          amount,
          sourceToken,
          destinationToken,
          Messenger.ALLBRIDGE,
        );
  
        const feeObj = {
          native: { amount: gasFeeOptions.native.float, symbol: sourceChain.chainSymbol || 'Native' },
          stablecoin: { amount: gasFeeOptions?.stablecoin?.float, symbol: sourceToken.symbol },
        };
  
        const transferTimeMs =
          this.sdk.getAverageTransferTime(sourceToken, destinationToken, Messenger.ALLBRIDGE) ?? 0;
  
        const conversionRate = (
          parseFloat(minimumReceiveAmount) / parseFloat(amount)
        ).toFixed(12);
  
        return {
          conversionRate,
          minimumAmountOut: minimumReceiveAmount,
          slippageTolerance: process.env.SLIPPAGE_TOLERANCE as string,
          fee: feeObj,
          completionTime: transferTimeMs,
        };
      } catch (error) {
        this.logger.error('Error in getSwapDetails:', error);
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }
  