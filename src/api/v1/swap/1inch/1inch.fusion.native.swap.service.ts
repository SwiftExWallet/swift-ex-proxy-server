import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import * as assert from 'node:assert';
import {
  EvmCrossChainOrder,
  HashLock,
  OrderStatus as CrossChainOrderStatus,
  SDK as CrossChainSDK,
  EvmAddress,
  NativeOrdersFactory,
  Address,
  PresetEnum,
  MerkleLeaf,
} from '@1inch/cross-chain-sdk';
import {
  FusionSDK,
  OrderStatus as SingleChainOrderStatus,
} from '@1inch/fusion-sdk';
import { ConfirmSwapOrderDto } from '../dto/prepareTxDto';
import { ChainId } from '../../common/enums/chain.enum';
import { FusionPlusSwapQuoteDto } from '../dto/fusionPlusSwapQuote';
import { RedisService } from '../../redis/redis.service';
import { SwapOrderService } from '../../swapOrders/swapOrders.service';
import { SwapOrderStatus } from '../../common/enums/order.enum';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';

interface RedisOrderSecretState {
  secrets: string[];
  secretHashes: string[];
  hashLock: any;
  submittedIdx: number[];
  isCrossChain: boolean;
}

@Injectable()
export class FustionNativeService {
  private readonly logger = new Logger(FustionNativeService.name);
  private readonly providers = new Map<number, ethers.JsonRpcProvider>();
  private crossChainSdk: CrossChainSDK;
  private fusionSdkMap = new Map<number, FusionSDK>();

  private readonly CHAIN_ID_TO_ENV_NAME: Record<number, string> = {
    1: 'ETH',
    56: 'BSC',
    137: 'POL',
    43114: 'AVAX',
    42161: 'ARB',
    10: 'OPT',
    8453: 'BASE',
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly swapOrderService: SwapOrderService,
    private readonly firebaseNotificationService: FirebaseNotificationService,
  ) {
    this.initialize1InchSdks();
  }

  private async getSecretState(key: string): Promise<{
    secrets: string[];
    secretHashes: string[];
    hashLock: any;
    submittedIdx: Set<number>;
    isCrossChain: boolean;
  } | null> {
    const rawStr = await this.redisService.getKey(`fusion_secrets:${key}`);
    if (!rawStr) return null;
    try {
      const parsed = JSON.parse(rawStr) as RedisOrderSecretState;
      return {
        ...parsed,
        submittedIdx: new Set(parsed.submittedIdx || []),
        isCrossChain: parsed.isCrossChain ?? true,
      };
    } catch (err) {
      this.logger.error(`Failed to parse secret state for key`, err);
      return null;
    }
  }

  private async setSecretState(key: string, state: any): Promise<void> {
    const dataToSave: RedisOrderSecretState = {
      secrets: state.secrets,
      secretHashes: state.secretHashes,
      hashLock: state.hashLock,
      submittedIdx: Array.from(state.submittedIdx),
      isCrossChain: state.isCrossChain,
    };
    await this.redisService.setKey(
      `fusion_secrets:${key}`,
      JSON.stringify(dataToSave),
    );
  }

  private async delSecretState(key: string): Promise<void> {
    await this.redisService.delKey(`fusion_secrets:${key}`);
  }

  private initialize1InchSdks() {
    const authKey = this.configService.get<string>('INCH_API_KEY');

    const dynamicConnector = {
      eth: {
        call: async (transactionConfig: any): Promise<string> => {
          const chainId = transactionConfig.chainId || 56;
          const provider = this.getProvider(chainId);
          return provider.call(transactionConfig);
        },
      },
      extend() {},
    };

    this.crossChainSdk = new CrossChainSDK({
      url: 'https://api.1inch.com/fusion-plus',
      authKey: authKey,
      blockchainProvider: dynamicConnector as any,
    });
  }

  private getFusionSdk(chainId: number): FusionSDK {
    if (!this.fusionSdkMap.has(chainId)) {
      const authKey = this.configService.get<string>('INCH_API_KEY');
      const instance = new FusionSDK({
        url: 'https://api.1inch.com/fusion',
        authKey: authKey,
        network: chainId,
      });
      this.fusionSdkMap.set(chainId, instance);
    }
    return this.fusionSdkMap.get(chainId)!;
  }

  public getProvider(chainId: number): ethers.JsonRpcProvider {
    if (!this.providers.has(chainId)) {
      const chainSuffix = this.CHAIN_ID_TO_ENV_NAME[chainId];
      if (!chainSuffix) {
        throw new BadRequestException(
          `Chain ID ${chainId} is not supported by your lookup mapping.`,
        );
      }
      const envKey = `PROVIDER_RPC_${chainSuffix}_1`;
      const rpcUrl = this.configService.get<string>(envKey);

      if (!rpcUrl) {
        throw new BadRequestException(
          `RPC configuration missing for ${envKey}. Please add it to your .env file.`,
        );
      }

      this.providers.set(chainId, new ethers.JsonRpcProvider(rpcUrl));
    }

    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new NotFoundException(
        `Failed to initialize provider context for chain: ${chainId}`,
      );
    }

    return provider;
  }

  async createSwapOrder(dto: FusionPlusSwapQuoteDto) {
    try {
      const {
        amount,
        srcChain,
        dstChain,
        srcTokenAddress,
        dstTokenAddress,
        walletAddress,
      } = dto;
      const srcChainId = ChainId[srcChain];
      const dstChainId = ChainId[dstChain];
      const isSingleChainSwap = srcChainId === dstChainId;

      // Single Chain Fusion Flow (Native to ERC20 / Same Chain Swap)
      if (isSingleChainSwap) {
        this.logger.log(
          `Executing Single-Chain Fusion flow on chain ${srcChainId}`,
        );
        const fusionSdk = this.getFusionSdk(srcChainId);
        const quoteParams = {
          fromTokenAddress: srcTokenAddress,
          toTokenAddress: dstTokenAddress,
          amount: amount,
          walletAddress: walletAddress,
        };
        const quote = await fusionSdk.getQuote(quoteParams);
        const preparedOrder = await fusionSdk.createOrder(quoteParams);
        const { Address } = require('@1inch/fusion-sdk');
        const makerAddress = new Address(walletAddress);
        const orderInfo = await fusionSdk.submitNativeOrder(
          preparedOrder.order,
          makerAddress,
          preparedOrder.quoteId,
        );
        this.logger.debug(
          `Single-Chain Order Submitted! Hash: ${orderInfo.orderHash}`,
        );

        await this.setSecretState(orderInfo.orderHash, {
          secrets: [],
          secretHashes: [],
          hashLock: null,
          submittedIdx: new Set(),
          isCrossChain: false,
        });

        const factory = NativeOrdersFactory.default(srcChainId);
        const call = factory.create(makerAddress, orderInfo.order);

        return {
          orderHash: orderInfo.orderHash,
          transaction: {
            to: call.to.toString(),
            data: call.data,
            value: call.value ? call.value.toString() : '0',
          },
          quote: quote,
        };
      }

      // Cross-Chain Fusion+ Flow (Different Source & Destination Chains)
      this.logger.log(
        `Executing Cross-Chain Fusion+ flow from ${srcChainId} to ${dstChainId}`,
      );
      const quote = await this.crossChainSdk.getQuote({
        amount: amount,
        srcChainId: srcChainId,
        dstChainId: dstChainId,
        enableEstimate: true,
        srcTokenAddress,
        dstTokenAddress,
        walletAddress: walletAddress,
      });

      const preset = quote.recommendedPreset;
      const secretCount = quote.presets[PresetEnum['fast']].secretsCount;

      const secrets = Array.from({ length: secretCount }, () =>
        ethers.hexlify(ethers.randomBytes(32)),
      );
      const secretHashes = secrets.map((s) => HashLock.hashSecret(s));

      let hashLock: HashLock;
      if (secretCount > 1) {
        const merkleLeaves = HashLock.getMerkleLeavesFromSecretHashes(
          secretHashes as MerkleLeaf[],
        );
        hashLock = HashLock.forMultipleFills(merkleLeaves);
      } else {
        hashLock = HashLock.forSingleFill(secrets[0]);
      }

      const { hash, quoteId, order } = this.crossChainSdk.createOrder(quote, {
        walletAddress: walletAddress,
        hashLock,
        preset,
        source: 'APP',
        secretHashes,
      });

      assert(order instanceof EvmCrossChainOrder);

      const orderInfo = await this.crossChainSdk.submitNativeOrder(
        quote.srcChainId,
        order,
        EvmAddress.fromString(walletAddress),
        quoteId,
        secretHashes,
      );

      await this.setSecretState(hash, {
        secrets,
        secretHashes,
        hashLock,
        submittedIdx: new Set(),
        isCrossChain: true,
      });

      const factory = NativeOrdersFactory.default(srcChainId);
      const call = factory.create(new Address(walletAddress), orderInfo.order);

      return {
        orderHash: hash,
        transaction: {
          to: call.to.toString(),
          data: call.data,
          value: call.value ? call.value.toString() : '0',
        },
        quote: quote,
      };
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.message ||
        'unable to build swap';
      throw new BadRequestException(message);
    }
  }

  async confirmSwapOrder(dto: ConfirmSwapOrderDto) {
    try {
      const { orderHash, txHash, srcChain } = dto;

      const secretState = await this.getSecretState(orderHash);
      if (!secretState) {
        throw new NotFoundException(
          'Order context was not found or has expired.',
        );
      }

      const chainId = ChainId[srcChain];
      const provider = this.getProvider(chainId);

      this.logger.log(
        `Awaiting 3 confirmations for tx: ${txHash} on chain: ${chainId}`,
      );

      provider
        .waitForTransaction(txHash, 3)
        .then(() => {
          this.logger.log(
            `Transaction ${txHash} confirmed. Spawning settlement routines.`,
          );
          this.startSecretSubmissionLoop(orderHash, chainId);
        })
        .catch((err) => {
          this.logger.error(`Error waiting for transaction ${txHash}:`, err);
        });

      return {
        success: true,
        typeTx: 'fusion',
        message: 'Fulfillment loop initiated on backend.',
      };
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.message ||
        'unable to confirm swap';
      throw new BadRequestException(message);
    }
  }

  private async startSecretSubmissionLoop(hash: string, chainId: number) {
    this.logger.log(`[Loop] Monitoring swap target states for order: ${hash}`);
    const POLL_INTERVAL_MS = 5000;

    try {
      while (true) {
        const secretState = await this.getSecretState(hash);
        if (!secretState) {
          this.logger.warn(
            `[Loop] Stopping loop for ${hash}. State cleared from Redis.`,
          );
          break;
        }

        // SINGLE-CHAIN MONITORING
        if (!secretState.isCrossChain) {
          const fusionSdk = this.getFusionSdk(chainId);
          const orderStatus = await fusionSdk.getOrderStatus(hash);
          this.logger.log(
            `[Loop-SingleChain] Order ${hash} current status: ${orderStatus.status}`,
          );

          if (
            orderStatus.status === SingleChainOrderStatus.Filled ||
            orderStatus.status === SingleChainOrderStatus.Expired ||
            orderStatus.status === SingleChainOrderStatus.Cancelled
          ) {
            let targetDbStatus = SwapOrderStatus.EXECUTED;
            if (orderStatus.status === SingleChainOrderStatus.Expired)
              targetDbStatus = SwapOrderStatus.EXPIRED;
            if (orderStatus.status === SingleChainOrderStatus.Cancelled)
              targetDbStatus = SwapOrderStatus.REFUNDED;

            const orderStatusUpdate =
              await this.swapOrderService.updateOrderByHash({
                txHash: hash,
                orderStatus: targetDbStatus,
              });

            this.logger.log(
              `[Loop-SingleChain] Sequence finalized with status: ${orderStatus.status}. Cleaning Redis.`,
              'DB status:',
              orderStatusUpdate,
            );

            if (orderStatusUpdate?.deviceFcmToken) {
              await this.firebaseNotificationService.sendNotification(
                orderStatusUpdate.deviceFcmToken,
                {
                  title: `Order Completed: ${orderStatusUpdate.amountOut} ${orderStatusUpdate.toToken}`,
                  body: `From ${orderStatusUpdate.walletAddress?.slice(0, 4)}.....${orderStatusUpdate.walletAddress?.slice(-4)}`,
                  data: {
                    network: orderStatusUpdate.fromChain,
                    txHash: orderStatusUpdate.txHash,
                  },
                },
              );
            }
            await this.delSecretState(hash);
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          continue;
        }

        // CROSS-CHAIN MONITORING
        const secretsToShare =
          await this.crossChainSdk.getReadyToAcceptSecretFills(hash);
        let stateUpdated = false;

        if (secretsToShare.fills.length) {
          for (const { idx } of secretsToShare.fills) {
            if (secretState.submittedIdx.has(idx)) {
              continue;
            }

            const secret = secretState.secrets[idx];
            if (!secret) {
              this.logger.warn(`[${hash}] No secret found at index ${idx}`);
              continue;
            }

            await this.crossChainSdk.submitSecret(hash, secret);
            secretState.submittedIdx.add(idx);
            stateUpdated = true;
            this.logger.log(
              `[Loop] Shared secret for index ${idx} on order ${hash}`,
            );
          }
        }

        if (stateUpdated) {
          await this.setSecretState(hash, secretState);
        }

        const { status } = await this.crossChainSdk.getOrderStatus(hash);
        this.logger.log(
          `[Loop-CrossChain] Order ${hash} current status: ${status}`,
        );

        if (
          status === CrossChainOrderStatus.Executed ||
          status === CrossChainOrderStatus.Expired ||
          status === CrossChainOrderStatus.Refunded
        ) {
          const orderStatusUpdate =
            await this.swapOrderService.updateOrderByHash({
              txHash: hash,
              orderStatus: SwapOrderStatus[status.toUpperCase()],
            });
          this.logger.log(
            `[Loop-CrossChain] Execution sequence finalized with status: ${status}. Cleaning Redis.`,
            'DB status:',
            orderStatusUpdate,
          );

          if (orderStatusUpdate?.deviceFcmToken) {
            await this.firebaseNotificationService.sendNotification(
              orderStatusUpdate.deviceFcmToken,
              {
                title: `Order Completed: ${orderStatusUpdate.amountOut} ${orderStatusUpdate.toToken}`,
                body: `From ${orderStatusUpdate.walletAddress?.slice(0, 4)}.....${orderStatusUpdate.walletAddress?.slice(-4)}`,
                data: {
                  network: orderStatusUpdate.fromChain,
                  txHash: orderStatusUpdate.txHash,
                },
              },
            );
          }
          await this.delSecretState(hash);
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      this.logger.error(
        `[Loop Error] Failure observed executing actions on ${hash}:`,
        error,
      );
    }
  }
}
