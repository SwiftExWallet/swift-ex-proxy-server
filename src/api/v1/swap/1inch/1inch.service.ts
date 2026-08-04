import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { SwapQuoteDto } from '../dto/swapQuote';
import { ChainId, swapProvider } from '../../common/enums/chain.enum';
import { SwapOrderStatus } from '../../common/enums/order.enum';
import { SwapOrderService } from '../../swapOrders/swapOrders.service';
import axios, { AxiosRequestConfig } from 'axios';
import { FusionOrderDto } from '../dto/fusionOrder';
import { SubmitOrderDto } from '../dto/submitOrder';
import { FusionPlusSwapQuoteDto } from '../dto/fusionPlusSwapQuote';
import { FusionPlusOrderDto } from '../dto/fusionPlusOrder';
import { ethers } from 'ethers';
import {
  HashLock,
  MerkleLeaf,
  SDK,
  OrderStatus as SDKOrderStatus,
} from '@1inch/cross-chain-sdk';
import { InchOrderStatusDto } from '../dto/1inchsOrderStatus';
import { encryptFusionSecrets } from '../../common/utils/encryption.util';
import { RedisService } from '../../redis/redis.service';
import { InchWsPollerService } from '../1inch/inchWsPoller.service';
import * as crypto from 'crypto';
import { CancelFusionOrderDto } from '../dto/cancelFusionOrder';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { NotificationDto } from '../../notification/dto/notification.dto';
import { ExhaustedOrderRepository } from '../../swapOrders/exhaustedOrder.repository';
import { PortfolioService } from '../../portfolio/portfolio.service';

interface RedisOrderSecretState {
  secrets: string[];
  secretHashes: string[];
  hashLock: any;
  submittedIdx: number[];
}

const SECRET_POLL_INTERVAL_MS = 10_000;
const SECRET_POLL_RETRY_STEP_MS = 10_000;
const SECRET_POLL_MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const SECRET_POLL_MAX_RESCHEDULES = 5;
const PENDING_RECOVERY_WINDOW_MS = 2 * 60 * 60 * 1000;

const SECRET_SUBMIT_ORDER_STATUSES: ReadonlySet<SDKOrderStatus> = new Set([
  SDKOrderStatus.Pending,
]);

const FINAL_ORDER_STATUSES: ReadonlySet<SDKOrderStatus> = new Set([
  SDKOrderStatus.Executed,
  SDKOrderStatus.Expired,
  SDKOrderStatus.Cancelled,
  SDKOrderStatus.Refunded,
]);

@Injectable()
export class InchService implements OnModuleInit {
  private readonly logger = new Logger(InchService.name);
  private readonly sdk: SDK;
  private readonly activeSecretPollers = new Map<string, NodeJS.Timeout>();
  private readonly secretPollReschedules = new Map<string, number>();
  private readonly sourceRefreshTriggered = new Set<string>();
  private isRecoveringPendingOrders = false;

  constructor(
    private readonly swapOrderService: SwapOrderService,
    private readonly redisService: RedisService,
    private readonly inchWsPollerService: InchWsPollerService,
    private readonly firebaseNotificationService: FirebaseNotificationService,
    private readonly exhaustedOrderRepository: ExhaustedOrderRepository,
    private readonly portfolioService: PortfolioService,
  ) {
    this.sdk = new SDK({
      url: 'https://api.1inch.com/fusion-plus',
      authKey: process.env.INCH_API_KEY,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.recoverPendingFusionPlusOrders();
  }

  private async getSecretState(key: string): Promise<{
    secrets: string[];
    secretHashes: string[];
    hashLock: any;
    submittedIdx: Set<number>;
  } | null> {
    const rawStr = await this.redisService.getKey(`fusion_secrets:${key}`);
    if (!rawStr) return null;
    try {
      const parsed = JSON.parse(rawStr) as RedisOrderSecretState;
      return {
        ...parsed,
        submittedIdx: new Set(parsed.submittedIdx || []),
      };
    } catch (err) {
      this.logger.error(`Failed to parse secret state for key: ${key}`, err);
      return null;
    }
  }

  private async setSecretState(key: string, state: any): Promise<void> {
    const dataToSave: RedisOrderSecretState = {
      secrets: state.secrets,
      secretHashes: state.secretHashes,
      hashLock: state.hashLock,
      submittedIdx: Array.from(state.submittedIdx),
    };
    await this.redisService.setKey(
      `fusion_secrets:${key}`,
      JSON.stringify(dataToSave),
    );
  }

  private async delSecretState(key: string): Promise<void> {
    await this.redisService.delKey(`fusion_secrets:${key}`);
  }

  async getSwapQuote(swapQuote: SwapQuoteDto) {
    const { tokenIn, tokenOut, amount, walletAddress, chain } = swapQuote;
    const url = `${process.env.QUOTER_BASE}/${ChainId[chain]}/quote/receive`;
    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: {
        walletAddress,
        amount,
        toTokenAddress: tokenOut,
        fromTokenAddress: tokenIn,
        enableEstimate: true,
        isPermit2: true,
      },
      paramsSerializer: { indexes: null },
    };

    try {
      const response = await axios.get(url, config);
      return response.data;
    } catch (error) {
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to get swap quote';
      throw new BadRequestException(message);
    }
  }

  async getFusionPlusSwapQuote(fusionPlusSwapQuote: FusionPlusSwapQuoteDto) {
    const {
      srcChain,
      dstChain,
      srcTokenAddress,
      dstTokenAddress,
      amount,
      walletAddress,
    } = fusionPlusSwapQuote;
    const url = `${process.env.FUSION_PLUS_QUOTER_BASE}/quote/receive`;
    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: {
        walletAddress,
        amount,
        srcChain: ChainId[srcChain],
        dstChain: ChainId[dstChain],
        srcTokenAddress,
        dstTokenAddress,
        enableEstimate: true,
        isPermit2: true,
      },
      paramsSerializer: { indexes: null },
    };

    try {
      const response = await axios.get(url, config);
      return response.data;
    } catch (error) {
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to get swap quote';
      throw new BadRequestException(message);
    }
  }

  async buildFusionOrder(fusionOrder: FusionOrderDto) {
    const { quote, tokenIn, tokenOut, amount, walletAddress, chain } =
      fusionOrder;
    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: {
        fee: 0,
        isPermit2: false,
        additionalAuctionStartDelay: 30,
        walletAddress,
        amount,
        toTokenAddress: tokenOut,
        fromTokenAddress: tokenIn,
      },
      paramsSerializer: { indexes: null },
    };
    const response = await axios.post(
      `${process.env.QUOTER_BASE}/${ChainId[chain]}/quote/build`,
      quote,
      config,
    );
    return response.data;
  }

  async buildFusionPlusOrder(fusionPlusOrder: FusionPlusOrderDto) {
    try {
      const { quoteId, walletAddress, secretCount, requiresApprovalTransaction } = fusionPlusOrder;
      const { secrets, secretHashes, hashLock } =
        this.generateSecrets(secretCount);

      await this.setSecretState(`quote:${quoteId}`, {
        secrets,
        secretHashes,
        hashLock,
        submittedIdx: new Set(),
      });

      const config: AxiosRequestConfig = {
        headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
        params: { quoteId },
        paramsSerializer: { indexes: null },
      };

      const body = {
        fee: 0,
        secretsHashList: secretHashes,
        preset: 'fast',
        walletAddress,
        hashLock,
        source: 'APP',
        ...(requiresApprovalTransaction && {
          additionalAuctionStartDelay: 20,
        }),
      };

      const response = await axios.post(
        `${process.env.FUSION_PLUS_QUOTER_BASE}/quote/build/evm`,
        body,
        config,
      );

      return response.data;
    } catch (error) {
      await this.delSecretState(`quote:${fusionPlusOrder.quoteId}`);
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to build swap';
      throw new BadRequestException(message);
    }
  }

  async submitFusionOrder(device: any, submitOrderDto: SubmitOrderDto) {
    try {
      const { order, signature, extension, quoteId, chain } = submitOrderDto;
      const config: AxiosRequestConfig = {
        headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
        params: {},
        paramsSerializer: { indexes: null },
      };
      const body = { order, signature, quoteId, extension };
      const response = await axios.post(
        `${process.env.INCH_RELAYER_BASE}/${ChainId[chain]}/order/submit`,
        body,
        config,
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to submit order';
      throw new BadRequestException(message);
    }
  }

  async submitFusionPlusOrder(device: any, submitOrderDto: SubmitOrderDto) {
    const { order, signature, extension, quoteId, chain, orderHash } =
      submitOrderDto;
    const tempKey = `quote:${quoteId}`;

    const secretState = await this.getSecretState(tempKey);
    if (!secretState) {
      throw new BadRequestException(
        `Secrets not found for quoteId "${quoteId}". Call buildFusionPlusOrder first.`,
      );
    }

    try {
      const config: AxiosRequestConfig = {
        headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
        params: {},
        paramsSerializer: { indexes: null },
      };
      const body = {
        order,
        srcChainId: ChainId[chain],
        signature,
        quoteId,
        extension,
      };

      const response = await axios.post(
        `${process.env.FUSION_PLUS_RELAYER_BASE}/submit`,
        body,
        config,
      );

      await this.delSecretState(tempKey);
      await this.setSecretState(orderHash, secretState);

      let encryptedFusionSecrets: string | undefined;
      const rawSecretsStr = await this.redisService.getKey(
        `fusion_secrets:${quoteId}`,
      );
      if (rawSecretsStr) {
        try {
          const rawSecrets = JSON.parse(rawSecretsStr);
          encryptedFusionSecrets = encryptFusionSecrets(rawSecrets);
          await this.redisService.delKey(`fusion_secrets:${quoteId}`);
        } catch (err) {
          this.logger.error('Failed to encrypt fusion secrets', err);
        }
      }

      this.startSecretRevealPoller(orderHash);

      return response.data;
    } catch (error: any) {
      await this.delSecretState(tempKey);
      await this.delSecretState(orderHash);
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to submit order';
      throw new BadRequestException(message);
    }
  }

  private stopSecretRevealPoller(orderHash: string): void {
    const timeout = this.activeSecretPollers.get(orderHash);
    if (timeout) {
      clearTimeout(timeout);
    }
    this.activeSecretPollers.delete(orderHash);
    this.secretPollReschedules.delete(orderHash);
    this.sourceRefreshTriggered.delete(orderHash);
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
    try {
      await this.portfolioService.refreshPortfolio(String(deviceId), walletAddress, [fromChain]);
    } catch (err) {
      this.logger.error(
        `[${orderHash}] Failed to refresh source portfolio after secret reveal`,
        this.getErrorMessage(err),
      );
    }
  }

  private mapFusionPlusStatus(status: SDKOrderStatus): SwapOrderStatus {
    return SwapOrderStatus[
      status.toUpperCase() as keyof typeof SwapOrderStatus
    ];
  }

  private getPendingRecoveryWindowMs(): number {
    const configuredWindowMs = Number(process.env.PENDING_RECOVERY_WINDOW_MS);
    return Number.isFinite(configuredWindowMs) && configuredWindowMs > 0
      ? configuredWindowMs
      : PENDING_RECOVERY_WINDOW_MS;
  }

  private getErrorMessage(err: unknown): unknown {
    return err instanceof Error ? err.message : err;
  }

  private async sendOrderStatusNotification(
    orderStatusUpdate: any,
    orderStatus: SwapOrderStatus,
  ): Promise<void> {
    if (
      orderStatus === SwapOrderStatus.REFUNDING ||
      !orderStatusUpdate?.deviceFcmToken
    ) {
      return;
    }

    try {
      await this.firebaseNotificationService.sendNotification(
        orderStatusUpdate.deviceFcmToken as string,
        {
          title: `Order ${orderStatus}: ${orderStatusUpdate?.amountOut} ${orderStatusUpdate?.toToken}`,
          body: `From ${orderStatusUpdate?.walletAddress?.slice(0, 4)}.....${orderStatusUpdate?.walletAddress?.slice(-4)}`,
          data: {
            network: orderStatusUpdate?.fromChain || '',
            txHash: orderStatusUpdate?.txHash || '',
          },
        },
      );
    } catch (err) {
      this.logger.error(
        `[${orderStatusUpdate?.txHash}] Failed to send ${orderStatus} notification`,
        this.getErrorMessage(err),
      );
    }
  }

  private async updateOrderStatusAndNotify(
    orderHash: string,
    orderStatus: SwapOrderStatus,
  ): Promise<any> {
    const orderStatusUpdate = await this.swapOrderService.updateOrderByHash({
      txHash: orderHash,
      orderStatus,
    });
    await this.sendOrderStatusNotification(orderStatusUpdate, orderStatus);
    return orderStatusUpdate;
  }

  private async exhaustSecretRevealPoller(
    orderHash: string,
    reason: unknown,
  ): Promise<boolean> {
    this.logger.error(
      `[${orderHash}] Secret reveal poller exhausted after ${SECRET_POLL_MAX_RESCHEDULES} reschedules`,
      this.getErrorMessage(reason),
    );

    try {
      const orderStatusUpdate = await this.updateOrderStatusAndNotify(
        orderHash,
        SwapOrderStatus.EXHAUSTED,
      );
      await this.saveExhaustedForReconciliation(orderHash, orderStatusUpdate);
      this.stopSecretRevealPoller(orderHash);
      return true;
    } catch (err) {
      this.logger.error(
        `[${orderHash}] Failed to mark order as exhausted`,
        this.getErrorMessage(err),
      );
      return false;
    }
  }

  private async saveExhaustedForReconciliation(
    orderHash: string,
    order?: any,
  ): Promise<void> {
    try {
      await this.exhaustedOrderRepository.upsertByTxHash(orderHash, {
        provider: swapProvider.ONEINCH_FUSION_PLUS,
        swapOrderId: order?._id ?? null,
        deviceFcmToken: order?.deviceFcmToken ?? null,
      });
      this.logger.log(
        `[${orderHash}] Saved to ExhaustedOrders for reconciliation`,
      );
    } catch (err) {
      this.logger.error(
        `[${orderHash}] Failed to save exhausted order for reconciliation`,
        this.getErrorMessage(err),
      );
    }
  }

  async resumeSecretRevealPolling(orderHash: string): Promise<boolean> {
    if (this.activeSecretPollers.has(orderHash)) {
      this.logger.log(
        `[${orderHash}] fusion+ poller already active, skipping reconciliation resume`,
      );
      return true;
    }

    const secretState = await this.getSecretState(orderHash);
    if (!secretState) {
      this.logger.warn(
        `[${orderHash}] fusion+ reconciliation found no secret state in redis, cannot resume`,
      );
      return false;
    }

    this.logger.log(
      `[${orderHash}] fusion+ reconciliation resuming secret reveal polling`,
    );
    this.secretPollReschedules.delete(orderHash);
    this.startSecretRevealPoller(orderHash);
    return true;
  }

  private startSecretRevealPoller(orderHash: string): void {
    if (this.activeSecretPollers.has(orderHash)) {
      return;
    }

    let retryDelayMs = SECRET_POLL_INTERVAL_MS;

    const schedule = (delayMs: number): void => {
      const timeout = setTimeout(() => void tick(), delayMs);
      this.activeSecretPollers.set(orderHash, timeout);
    };

    const rescheduleOrExhaust = async (
      delayMs: number,
      reason: unknown,
    ): Promise<void> => {
      const rescheduleCount =
        this.secretPollReschedules.get(orderHash) ?? 0;

      if (rescheduleCount >= SECRET_POLL_MAX_RESCHEDULES) {
        await this.exhaustSecretRevealPoller(orderHash, reason);
        return;
      }

      const nextRescheduleCount = rescheduleCount + 1;
      this.secretPollReschedules.set(orderHash, nextRescheduleCount);
      schedule(delayMs);
    };

    const tick = async (): Promise<void> => {
      const secretState = await this.getSecretState(orderHash);
      if (!secretState) {
        this.stopSecretRevealPoller(orderHash);
        return;
      }

      try {
        const { status } = await this.sdk.getOrderStatus(orderHash);

        if (SECRET_SUBMIT_ORDER_STATUSES.has(status)) {
          const data = await this.sdk.getReadyToAcceptSecretFills(orderHash);
          let stateUpdated = false;
          this.logger.debug("fills length: ", data?.fills?.length || 0)
          for (const { idx } of data.fills) {
            if (secretState.submittedIdx.has(idx)) {
              continue;
            }

            const secret = secretState.secrets[idx];
            if (!secret) {
              this.logger.warn(`[${orderHash}] No secret at index ${idx}`);
              continue;
            }

            await this.sdk.submitSecret(orderHash, secret);
            secretState.submittedIdx.add(idx);
            stateUpdated = true;
            this.logger.log(
              `[${orderHash}] Secret revealed for fill idx ${idx}`,
            );
          }

          if (stateUpdated) {
            await this.setSecretState(orderHash, secretState);

            if (!this.sourceRefreshTriggered.has(orderHash)) {
              this.sourceRefreshTriggered.add(orderHash);
              void this.refreshSourcePortfolio(orderHash);
            }
          }

          retryDelayMs = SECRET_POLL_INTERVAL_MS;
          await rescheduleOrExhaust(retryDelayMs, `order status remained ${status}`);
          return;
        }

        if (status === SDKOrderStatus.Refunding) {
          const orderStatusUpdate = await this.updateOrderStatusAndNotify(
            orderHash,
            SwapOrderStatus.REFUNDING,
          );
          this.logger.log(
            `[${orderHash}] Order status updated: ${status}. Continuing polling.`,
            'DB status:',
            orderStatusUpdate,
          );

          retryDelayMs = SECRET_POLL_INTERVAL_MS;
          await rescheduleOrExhaust(retryDelayMs, `order status remained ${status}`);
          return;
        }

        if (FINAL_ORDER_STATUSES.has(status)) {
          const resolvedStatus = this.mapFusionPlusStatus(status);
          const orderStatusUpdate = await this.updateOrderStatusAndNotify(
            orderHash,
            resolvedStatus,
          );
          this.logger.log(
            `[${orderHash}] Order terminal reached: ${status}. Cleaning Redis state.`,
            'DB status:',
            orderStatusUpdate,
          );
          await this.delSecretState(orderHash);
          await this.exhaustedOrderRepository
            .deleteByTxHash(orderHash)
            .catch((err) =>
              this.logger.error(
                `[${orderHash}] Failed to remove ExhaustedOrder record`,
                this.getErrorMessage(err),
              ),
            );
          this.stopSecretRevealPoller(orderHash);
          return;
        }

        this.logger.warn(
          `[${orderHash}] Unhandled Fusion+ status "${status}". Continuing polling.`,
        );
        retryDelayMs = SECRET_POLL_INTERVAL_MS;
        await rescheduleOrExhaust(retryDelayMs, `unhandled order status ${status}`);
      } catch (err) {
        retryDelayMs = Math.min(
          retryDelayMs + SECRET_POLL_RETRY_STEP_MS,
          SECRET_POLL_MAX_RETRY_DELAY_MS,
        );
        this.logger.error(
          `[${orderHash}] Poller error (will retry in ${retryDelayMs}ms if reschedule budget remains):`,
          this.getErrorMessage(err),
        );
        await rescheduleOrExhaust(retryDelayMs, err);
      }
    };

    schedule(retryDelayMs);
  }

  async recoverPendingFusionPlusOrders(): Promise<void> {
    if (this.isRecoveringPendingOrders) {
      return;
    }

    this.isRecoveringPendingOrders = true;
    try {
      const since = new Date(Date.now() - this.getPendingRecoveryWindowMs());
      const result = await this.swapOrderService.findByProviderAndStatusesSince(
        swapProvider.ONEINCH_FUSION_PLUS,
        [SwapOrderStatus.PENDING, SwapOrderStatus.REFUNDING],
        since,
      );
      if (!result.ok) {
        this.logger.error(
          `fusion+ startup recovery fetch failed: ${result.error}`,
        );
        return;
      }

      const { data: pending } = result;
      if (!pending.length) {
        return;
      }

      this.logger.log(
        `fusion+ startup recovery: found ${pending.length} active order(s) created since ${since.toISOString()}`,
      );

      for (const order of pending) {
        if (this.activeSecretPollers.has(order.txHash)) {
          continue;
        }

        const secretState = await this.getSecretState(order.txHash);
        if (!secretState) {
          this.logger.warn(
            `[${order.txHash}] active fusion+ order has no secret state in redis, skipping recovery`,
          );
          continue;
        }

        this.logger.log(`[${order.txHash}] resuming secret reveal polling`);
        this.startSecretRevealPoller(order.txHash);
      }
    } finally {
      this.isRecoveringPendingOrders = false;
    }
  }

  async cancelOrder(cancelFusionOrderDto: CancelFusionOrderDto) {
    const { chain, orderHash } = cancelFusionOrderDto;
    const url = `${process.env.QUOTER_BASE}/${ChainId[chain]}/order/cancel`;

    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: {},
      paramsSerializer: { indexes: null },
    };
    const response = await axios.post(url, { orderHash }, config);
    return response.data;
  }

  private generateSecrets(count: number): {
    secrets: string[];
    secretHashes: string[];
    hashLock: HashLock;
  } {
    const secrets = Array.from({ length: count }, () =>
      ethers.hexlify(ethers.randomBytes(32)),
    );

    const secretHashes = secrets.map((s) => HashLock.hashSecret(s));

    let hashLock: HashLock;
    if (count > 2) {
      const merkleLeaves = HashLock.getMerkleLeavesFromSecretHashes(
        secretHashes as MerkleLeaf[],
      );
      hashLock = HashLock.forMultipleFills(merkleLeaves);
    } else {
      hashLock = HashLock.forSingleFill(secrets[0]);
    }

    return { secrets, secretHashes, hashLock };
  }

  createSecretForQuoteId(quoteId: string, index: number) {
    const secret = crypto
      .createHmac('sha256', process.env.MASTER_HASH_KEY as string)
      .update(`${index}-${quoteId}`)
      .digest();
    return ethers.hexlify(secret);
  }

  async orderStatus(inchOrderStatusDto: InchOrderStatusDto) {
    if (
      inchOrderStatusDto.swapProvider === swapProvider['ONEINCH_FUSION_PLUS']
    ) {
      return await this.fusionPlusOrderStatus(inchOrderStatusDto);
    }
    const url = `${process.env.INCH_ORDER_BASE}/${ChainId[inchOrderStatusDto.chain]}/order/status/${inchOrderStatusDto.orderHash}`;
    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: {},
      paramsSerializer: { indexes: null },
    };

    try {
      const response = await axios.get(url, config);
      if (response.data.status) {
        const orderStatusUpdate = await this.swapOrderService.updateOrderByHash(
          {
            txHash: inchOrderStatusDto.orderHash,
            orderStatus: SwapOrderStatus[response.data.status.toUpperCase()],
          },
        );
        // await this.firebaseNotificationService.sendNotification(
        //   orderStatusUpdate?.deviceFcmToken as string,
        //   {
        //     title: `Received: ${orderStatusUpdate?.amountOut} ${orderStatusUpdate?.toToken}`,
        //     body: `From ${orderStatusUpdate?.walletAddress}`,
        //     data: { "network": orderStatusUpdate?.fromChain || "", "txHash": orderStatusUpdate?.txHash || "" },
        //   },
        // );
      }
      return response.data;
    } catch (error) {
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to get order status';
      throw new BadRequestException(message);
    }
  }

  async fusionPlusOrderStatus(inchOrderStatusDto: InchOrderStatusDto) {
    const url = `${process.env.FUSION_PLUS_ORDER_BASE}${inchOrderStatusDto.orderHash}`;
    const config: AxiosRequestConfig = {
      headers: { Authorization: `Bearer ${process.env.INCH_API_KEY}` },
      params: {},
      paramsSerializer: { indexes: null },
    };

    try {
      const response = await axios.get(url, config);
      if (response.data.status) {
        const orderStatusUpdate = await this.swapOrderService.updateOrderByHash(
          {
            txHash: inchOrderStatusDto.orderHash,
            orderStatus: SwapOrderStatus[response.data.status.toUpperCase()],
          },
        );
        // await this.firebaseNotificationService.sendNotification(
        //   orderStatusUpdate?.deviceFcmToken as string,
        //   {
        //     title: `Received: ${orderStatusUpdate?.amountOut} ${orderStatusUpdate?.toToken}`,
        //     body: `From ${orderStatusUpdate?.walletAddress?.slice(0, 4)}.....${orderStatusUpdate?.walletAddress?.slice(-4)}`,
        //     data: { "network": orderStatusUpdate?.fromChain || "", "txHash": orderStatusUpdate?.txHash || "" },
        //   },
        // );
      }
      return response.data;
    } catch (error) {
      this.logger.error(error);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to get order status';
      throw new BadRequestException(message);
    }
  }

  async fireCustomNotification(device: any, notificationDto: NotificationDto) {
    try {
      await this.firebaseNotificationService.sendNotification(
        device?.fcmToken as string,
        {
          title: notificationDto.title,
          body: notificationDto.body,
          data: notificationDto.data,
        },
      );
      return true;
    } catch (error) {
      throw new BadRequestException('unable to send notification');
    }
  }
}
