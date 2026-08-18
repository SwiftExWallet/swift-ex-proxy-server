import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
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
  Address as FusionAddress,
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
import {
  decryptFusionSecretState,
  encryptFusionSecretState,
  isFusionSecretStateEnvelope,
} from '../../common/utils/encryption.util';
import { withProviderControls } from '../../common/utils/retry.util';
import {
  createProviderBadRequestException,
  throwIfHttpException,
} from '../../common/utils/provider-error.util';
import {
  getOneInchAllowedHosts,
  getProviderRpcAllowedHosts,
  validateProviderUrl,
} from '../../common/config/provider-url.config';
import {
  getVerifiedWalletAddressFromWallet,
  resolveWalletChain,
  type Wallet,
  withExplicitVerifiedWalletAddress,
} from '../../common/helpers/requestWallet';
import { PortfolioService } from '../../portfolio/portfolio.service';

interface RedisOrderSecretState {
  secrets: string[];
  secretHashes: string[];
  hashLock: any;
  submittedIdx: number[];
  isCrossChain: boolean;
}

interface ParsedRedisOrderSecretState {
  state: RedisOrderSecretState;
  isPlaintext: boolean;
}

const DEFAULT_FUSION_SECRET_STATE_TTL_SECONDS = 2 * 60 * 60;
const FUSION_NATIVE_SECRET_POLL_INTERVAL_MS = 5_000;
const DEFAULT_FUSION_NATIVE_SECRET_POLL_MAX_SCHEDULES = 1_440;
const DEFAULT_FUSION_NATIVE_SECRET_POLL_MAX_PROVIDER_FAILURES = 5;

@Injectable()
export class FusionNativeService {
  private readonly logger = new Logger(FusionNativeService.name);
  private readonly oneInchAllowedHosts = getOneInchAllowedHosts();
  private readonly rpcAllowedHosts = getProviderRpcAllowedHosts();
  private readonly providers = new Map<number, ethers.JsonRpcProvider>();
  private crossChainSdk: CrossChainSDK;
  private fusionSdkMap = new Map<number, FusionSDK>();
  private readonly sourceRefreshTriggered = new Set<string>();

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
    private readonly portfolioService: PortfolioService,
  ) {
    this.initialize1InchSdks();
  }

  private getErrorMessage(err: unknown): unknown {
    return err instanceof Error ? err.message : err;
  }

  private async refreshSourcePortfolio(orderHash: string): Promise<void> {
    const result = await this.swapOrderService.findByTxHash(orderHash);
    if (!result.ok || !result.data) {
      this.logger.warn(
        `[${orderHash}] Could not load order for source portfolio refresh`,
      );
      return;
    }

    const { deviceId, walletAddress, fromChain } = result.data;
    if (!deviceId) {
      return;
    }

    try {
      await this.portfolioService.refreshPortfolio(
        String(deviceId),
        walletAddress,
        [fromChain],
      );
    } catch (err) {
      this.logger.error(
        `[${orderHash}] Failed to refresh source portfolio after secret reveal`,
        this.getErrorMessage(err),
      );
    }
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

    const parsed = this.parseSecretState(rawStr);
    if (!parsed) {
      this.logger.error(`Failed to parse secret state for key`);
      return null;
    }

    const secretState = this.normalizeSecretState(parsed.state);

    if (parsed.isPlaintext) {
      await this.setSecretState(key, secretState);
    }

    return secretState;
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
      encryptFusionSecretState(dataToSave),
      this.getSecretStateTtlSeconds(),
    );
  }

  private async delSecretState(key: string): Promise<void> {
    await this.redisService.delKey(`fusion_secrets:${key}`);
  }

  private getSecretStateTtlSeconds(): number {
    const configuredTtlSeconds = Number(
      process.env.FUSION_SECRET_STATE_TTL_SECONDS,
    );
    return Number.isFinite(configuredTtlSeconds) && configuredTtlSeconds > 0
      ? configuredTtlSeconds
      : DEFAULT_FUSION_SECRET_STATE_TTL_SECONDS;
  }

  private getSecretSubmissionMaxSchedules(): number {
    const configuredMaxSchedules = Number(
      process.env.FUSION_NATIVE_SECRET_POLL_MAX_SCHEDULES,
    );
    return Number.isFinite(configuredMaxSchedules) && configuredMaxSchedules > 0
      ? Math.floor(configuredMaxSchedules)
      : DEFAULT_FUSION_NATIVE_SECRET_POLL_MAX_SCHEDULES;
  }

  private getSecretSubmissionMaxProviderFailures(): number {
    const configuredMaxProviderFailures = Number(
      process.env.FUSION_NATIVE_SECRET_POLL_MAX_PROVIDER_FAILURES,
    );
    return Number.isFinite(configuredMaxProviderFailures) &&
      configuredMaxProviderFailures > 0
      ? Math.floor(configuredMaxProviderFailures)
      : DEFAULT_FUSION_NATIVE_SECRET_POLL_MAX_PROVIDER_FAILURES;
  }

  private parseSecretState(rawStr: string): ParsedRedisOrderSecretState | null {
    try {
      const parsed = JSON.parse(rawStr);

      if (isFusionSecretStateEnvelope(parsed)) {
        return {
          state: decryptFusionSecretState(rawStr) as RedisOrderSecretState,
          isPlaintext: false,
        };
      }

      return {
        state: parsed as RedisOrderSecretState,
        isPlaintext: true,
      };
    } catch {
      return null;
    }
  }

  private normalizeSecretState(state: RedisOrderSecretState): {
    secrets: string[];
    secretHashes: string[];
    hashLock: any;
    submittedIdx: Set<number>;
    isCrossChain: boolean;
  } {
    return {
      ...state,
      submittedIdx: new Set(state.submittedIdx || []),
      isCrossChain: state.isCrossChain ?? true,
    };
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
      url: validateProviderUrl('https://api.1inch.com/fusion-plus', {
        source: 'INCH_FUSION_PLUS_SDK_URL',
        allowedHosts: this.oneInchAllowedHosts,
      }),
      authKey: authKey,
      blockchainProvider: dynamicConnector as any,
    });
  }

  private getFusionSdk(chainId: number): FusionSDK {
    if (!this.fusionSdkMap.has(chainId)) {
      const authKey = this.configService.get<string>('INCH_API_KEY');
      const instance = new FusionSDK({
        url: validateProviderUrl('https://api.1inch.com/fusion', {
          source: 'INCH_FUSION_SDK_URL',
          allowedHosts: this.oneInchAllowedHosts,
        }),
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
          'RPC configuration missing for requested chain.',
        );
      }

      const safeRpcUrl = validateProviderUrl(rpcUrl, {
        source: envKey,
        allowedHosts: this.rpcAllowedHosts,
      });

      this.providers.set(chainId, new ethers.JsonRpcProvider(safeRpcUrl));
    }

    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new NotFoundException(
        `Failed to initialize provider context for chain: ${chainId}`,
      );
    }

    return provider;
  }

  async createSwapOrder(dto: FusionPlusSwapQuoteDto, verifiedWallet?: Wallet) {
    const verifiedDto = verifiedWallet
      ? withExplicitVerifiedWalletAddress(
          dto,
          verifiedWallet,
          'walletAddress',
          resolveWalletChain(dto.srcChain),
        )
      : dto;
    try {
      const {
        amount,
        srcChain,
        dstChain,
        srcTokenAddress,
        dstTokenAddress,
        walletAddress,
      } = verifiedDto;
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
        const quote = await withProviderControls(
          '1inch:fusion-native:quote',
          () => fusionSdk.getQuote(quoteParams),
        );
        const preparedOrder = await withProviderControls(
          '1inch:fusion-native:create-order',
          () => fusionSdk.createOrder(quoteParams),
        );
        const makerAddress = new FusionAddress(walletAddress);
        const nativeMakerAddress = new Address(walletAddress);
        const orderInfo = await withProviderControls(
          '1inch:fusion-native:submit-order',
          () =>
            fusionSdk.submitNativeOrder(
              preparedOrder.order,
              makerAddress,
              preparedOrder.quoteId,
            ),
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
        const call = factory.create(nativeMakerAddress, orderInfo.order);

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
      const quote = await withProviderControls(
        '1inch:fusion-plus-native:quote',
        () =>
          this.crossChainSdk.getQuote({
            amount: amount,
            srcChainId: srcChainId,
            dstChainId: dstChainId,
            enableEstimate: true,
            srcTokenAddress,
            dstTokenAddress,
            walletAddress: walletAddress,
          }),
      );

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

      const orderInfo = await withProviderControls(
        '1inch:fusion-plus-native:submit-order',
        () =>
          this.crossChainSdk.submitNativeOrder(
            quote.srcChainId,
            order,
            EvmAddress.fromString(walletAddress),
            quoteId,
            secretHashes,
          ),
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
      throwIfHttpException(error);
      this.logger.error(error);
      throw createProviderBadRequestException(error);
    }
  }

  async confirmSwapOrder(dto: ConfirmSwapOrderDto, walletAddress: Wallet) {
    try {
      const { orderHash, txHash, srcChain } = dto;

      await this.assertOrderBelongsToVerifiedWallet(
        getVerifiedWalletAddressFromWallet(
          walletAddress,
          resolveWalletChain(srcChain),
        ),
        orderHash,
        walletAddress,
      );

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
      throwIfHttpException(error);
      this.logger.error(error);
      throw createProviderBadRequestException(error);
    }
  }

  private async assertOrderBelongsToVerifiedWallet(
    walletAddress: string,
    orderHash: string,
    verifiedWallet: Wallet,
  ): Promise<void> {
    const result = await this.swapOrderService.findOrderByHashForVerifiedWallet(
      orderHash,
      walletAddress,
      verifiedWallet,
    );

    if (!result.ok) {
      throw new InternalServerErrorException(
        'Could not verify order ownership.',
      );
    }

    if (!result.data) {
      throw new NotFoundException('Order not found.');
    }
  }

  private async exhaustSecretSubmissionLoop(
    hash: string,
    reason = 'schedule budget exhausted',
  ): Promise<void> {
    try {
      this.logger.warn(
        `[Loop Exhausted] Native Fusion monitoring exhausted for ${hash}: ${reason}`,
      );
      await this.swapOrderService.updateOrderByHash({
        txHash: hash,
        orderStatus: SwapOrderStatus.EXHAUSTED,
      });
      await this.delSecretState(hash);
    } catch (error) {
      this.logger.error(
        `[Loop Error] Failed to exhaust native Fusion order ${hash}:`,
        error,
      );
    }
  }

  private async waitBeforeNextSecretSubmissionPoll(
    scheduleCount: number,
    maxSchedules: number,
  ): Promise<void> {
    if (scheduleCount >= maxSchedules) {
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, FUSION_NATIVE_SECRET_POLL_INTERVAL_MS),
    );
  }

  private async startSecretSubmissionLoop(hash: string, chainId: number) {
    this.logger.log(`[Loop] Monitoring swap target states for order: ${hash}`);
    const maxSchedules = this.getSecretSubmissionMaxSchedules();
    const maxProviderFailures = this.getSecretSubmissionMaxProviderFailures();
    let scheduleCount = 0;
    let consecutiveProviderFailures = 0;

    try {
      while (scheduleCount < maxSchedules) {
        scheduleCount += 1;
        const secretState = await this.getSecretState(hash);
        if (!secretState) {
          this.logger.warn(
            `[Loop] Stopping loop for ${hash}. State cleared from Redis.`,
          );
          this.sourceRefreshTriggered.delete(hash);
          return;
        }

        try {
          // SINGLE-CHAIN MONITORING
          if (!secretState.isCrossChain) {
            const fusionSdk = this.getFusionSdk(chainId);
            const orderStatus = await withProviderControls(
              '1inch:fusion-native:order-status',
              () => fusionSdk.getOrderStatus(hash),
            );
            this.logger.log(
              `[Loop-SingleChain] Order ${hash} current status: ${orderStatus.status}`,
            );
            consecutiveProviderFailures = 0;

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
              return;
            }

            await this.waitBeforeNextSecretSubmissionPoll(
              scheduleCount,
              maxSchedules,
            );
            continue;
          }

          // CROSS-CHAIN MONITORING
          const secretsToShare = await withProviderControls(
            '1inch:fusion-plus-native:ready-fills',
            () => this.crossChainSdk.getReadyToAcceptSecretFills(hash),
          );
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

              await withProviderControls(
                '1inch:fusion-plus-native:submit-secret',
                () => this.crossChainSdk.submitSecret(hash, secret),
              );
              secretState.submittedIdx.add(idx);
              stateUpdated = true;
              this.logger.log(
                `[Loop] Shared secret for index ${idx} on order ${hash}`,
              );
            }
          }

          if (stateUpdated) {
            await this.setSecretState(hash, secretState);
            if (!this.sourceRefreshTriggered.has(hash)) {
              this.sourceRefreshTriggered.add(hash);
              void this.refreshSourcePortfolio(hash);
            }
          }

          const { status } = await withProviderControls(
            '1inch:fusion-plus-native:order-status',
            () => this.crossChainSdk.getOrderStatus(hash),
          );
          consecutiveProviderFailures = 0;
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
            this.sourceRefreshTriggered.delete(hash);
            return;
          }

          await this.waitBeforeNextSecretSubmissionPoll(
            scheduleCount,
            maxSchedules,
          );
        } catch (error) {
          consecutiveProviderFailures += 1;
          this.logger.error(
            `[Loop Retry] Provider/action failure for ${hash}; schedule ${scheduleCount}/${maxSchedules}; provider failures ${consecutiveProviderFailures}/${maxProviderFailures}`,
            error,
          );
          if (consecutiveProviderFailures >= maxProviderFailures) {
            await this.exhaustSecretSubmissionLoop(
              hash,
              `provider failure budget exhausted after ${consecutiveProviderFailures} consecutive failures`,
            );
            return;
          }

          await this.waitBeforeNextSecretSubmissionPoll(
            scheduleCount,
            maxSchedules,
          );
        }
      }

      await this.exhaustSecretSubmissionLoop(hash);
    } catch (error) {
      this.logger.error(
        `[Loop Error] Failure observed executing actions on ${hash}:`,
        error,
      );
    }
  }
}
