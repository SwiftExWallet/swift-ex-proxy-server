import {
  AllbridgeCoreSdk,
  ChainDetailsMap,
  ChainSymbol,
  ChainType,
  Messenger,
  RawTransaction,
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
import { ValidWalletType } from '../../common/enums/all-bridge.enum';
import { AllBridgeSwapADto } from './dto/all-bridge-swap.dto';
import { AllBridgeQuotesDto } from './dto/all-bridge-swap-quotes.dto';
import { getEstimateGas, getFeeData, getNetwork, getTransactionCount } from '../../common/helpers/blockchainUtilityMethods';
import { JsonRpcProvider } from 'ethers';

@Injectable()
export class AllBridgeService {
  private readonly logger = new Logger(AllBridgeService.name);
  provider: JsonRpcProvider;

  private sdk: AllbridgeCoreSdk;
  constructor() {
    this.provider = new JsonRpcProvider(process.env.PROVIDER_RPC_ETH || '');
    this.sdk = new AllbridgeCoreSdk({
      ETH: process.env.PROVIDER_RPC_ETH as string,
    });
  }

  private async fetchTokens(sourceToken: string, walletType?: ValidWalletType) {
    if (!walletType) {
      const stellarUsdcToken: TokenWithChainDetails = {
        symbol: 'USDC',
        poolAddress: 'CAOTMWRKNMV5GWSVOMWCTCM5ZZFEQFUSWNLCZXA2KAXD4YG5A4DIPNFT',
        tokenAddress:
          'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
        decimals: 7,
        name: 'USDC',
        originTokenAddress:
          'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        feeShare: '0.0015',
        apr: '0.00539366263763284889',
        apr7d: '0.00539366263763284889',
        apr30d: '0.01920902464693611048',
        lpRate: '0.49916956736366436919',
        chainSymbol: ChainSymbol.STLR, // use the proper enum constant
        chainType: ChainType.SRB, // adjust type accordingly
        allbridgeChainId: 7,
        bridgeAddress:
          'CBQ6GW7QCFFE252QEVENUNG45KYHHBRO4IZIWFJOXEFANHPQUXX5NFWV',
        transferTime: {
          ETH: { '1': 420000, '2': 420000, '3': 420000 },
          BSC: { '1': 120000, '2': 120000, '3': 120000 },
          POL: { '1': 120000, '2': 120000, '3': 120000 },
          ARB: { '1': 120000, '2': 120000, '3': 120000 },
          AVA: { '1': 180000, '2': 180000, '3': 180000 },
          OPT: { '1': 180000, '2': 180000, '3': 180000 },
          BAS: { '1': 120000, '2': 120000, '3': 120000 },
          CEL: { '1': 120000, '2': 120000, '3': 120000 },
          TRX: { '1': 120000, '2': 120000, '3': 120000 },
          SOL: { '1': 180000, '2': 180000, '3': 180000 },
        },
        txCostAmount: {
          swap: '15000000',
          transfer: '5000000',
          maxAmount: '30000000',
        },
        confirmations: 10,
        chainName: 'Stellar',
      };

      return stellarUsdcToken;
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
      } = swapDto;
      const sourceTokenCoin = await this.fetchTokens(sourceToken, walletType);

      const destinationTokenCoin = await this.fetchTokens(destinationToken);

      if (!sourceTokenCoin && !destinationTokenCoin) {
        throw new BadRequestException(
          'Either invalid source or destination token',
        );
      }

      this.logger.log('===tokens ==', {
        sourceTokenCoin,
        destinationTokenCoin,
      });

      if (
        !(await this.sdk.bridge.checkAllowance({
          token: sourceTokenCoin as TokenWithChainDetails,
          owner: fromAddress,
          amount: amount,
        }))
      ) {
        this.logger.log('=== preparing approve transaction ===');

        const transaction: RawTransaction =
          await this.sdk.bridge.rawTxBuilder.approve({
            token: sourceTokenCoin as TokenWithChainDetails,
            owner: fromAddress,
          });
        this.logger.log('=== rawTransactionApprove ===', transaction);
        const [nonce, gasLimit, feeData, network] = await Promise.all([
          getTransactionCount(this.provider, fromAddress),
          getEstimateGas(this.provider, fromAddress, transaction),
          getFeeData(this.provider),
          getNetwork(this.provider),
        ]);
        const txMeta = {
          nonce: nonce,
          gasLimit: gasLimit,
          feeData: feeData,
          network: network,
        };
        return {
          transaction,
          txMeta,
          type: 'approve',
        };
      }
      this.logger.log('=== preparing transfer transaction ===');

      // Initiate transfer
      const transaction: RawTransaction =
        await this.sdk.bridge.rawTxBuilder.send({
          amount: amount,
          fromAccountAddress: fromAddress,
          toAccountAddress: toAddress,
          sourceToken: sourceTokenCoin as TokenWithChainDetails,
          destinationToken: destinationTokenCoin as TokenWithChainDetails,
          messenger: Messenger.ALLBRIDGE,
        });
      this.logger.log('=== transfer transaction ===', transaction);
      const [nonce, gasLimit, feeData, network] = await Promise.all([
        getTransactionCount(this.provider, fromAddress),
        getEstimateGas(this.provider, fromAddress, transaction),
        getFeeData(this.provider),
        getNetwork(this.provider),
      ]);
      const txMeta = {
        nonce: nonce,
        gasLimit: gasLimit,
        feeData: feeData,
        network: network,
      };

      return {
        transaction,
         txMeta,
        type: 'transfer',
      };
    } catch (error) {
      console.error('Error in swap prepare:', error);
      throw new BadRequestException(error.message);
    }
  }

  async getSwapDetails(allBridgeQuotes: AllBridgeQuotesDto): Promise<{
    conversionRate: string;
    minimumAmountOut: string;
    slippageTolerance: string;
  }> {
    try {
      const chains = await this.sdk.chainDetailsMap();
      const { chainType, amount } = allBridgeQuotes;

      const sourceChain =
        chainType == ValidWalletType.ETH
          ? chains[ChainSymbol.ETH]
          : chains[ChainSymbol.BSC];
      const destinationChain = chains[ChainSymbol.SRB];
      this.logger.log('===chains ==', { sourceChain, destinationChain });

      if (!sourceChain || !destinationChain) {
        throw new NotFoundException('Chain details not found');
      }

      const sourceToken = sourceChain.tokens.find(
        (token) => token.symbol === 'USDT',
      );
      const destinationToken = destinationChain.tokens.find(
        (token) => token.symbol === 'USDC',
      );
      this.logger.log('===tokens ==', { sourceToken, destinationToken });

      if (!sourceToken || !destinationToken) {
        throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
      }

      // Get minimum amount after bridge swap
      const minimumReceiveAmount = await this.sdk.getAmountToBeReceived(
        amount,
        sourceToken,
        destinationToken,
        Messenger.ALLBRIDGE,
      );
      this.logger.log('===minimumReceiveAmount ==', minimumReceiveAmount);

      // Calculate conversion rate
      const conversionRate = (
        parseFloat(minimumReceiveAmount) / parseFloat(amount)
      ).toFixed(12);
      this.logger.log('===conversionRate ==', conversionRate);

      // Set slippage tolerance (default 1%)
      const slippageTolerance = process.env.SLIPPAGE_TOLERANCE as string;
      return {
        conversionRate,
        minimumAmountOut: minimumReceiveAmount,
        slippageTolerance,
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
