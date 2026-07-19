import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
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
import {
  decryptFusionSecretState,
  encryptFusionSecretState,
  encryptFusionSecrets,
  isFusionSecretStateEnvelope,
} from '../../common/utils/encryption.util';
import { RedisService } from '../../redis/redis.service';
import * as crypto from 'crypto';
import { CancelFusionOrderDto } from '../dto/cancelFusionOrder';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { NotificationDto } from '../../notification/dto/notification.dto';

interface RedisOrderSecretState {
  secrets: string[];
  secretHashes: string[];
  hashLock: any;
  submittedIdx: number[];
}

interface ParsedRedisOrderSecretState {
  state: RedisOrderSecretState;
  isPlaintext: boolean;
}

const SECRET_POLL_INTERVAL_MS = 10_000;
const SECRET_POLL_RETRY_STEP_MS = 5_000;
const SECRET_POLL_MAX_RETRY_DELAY_MS = 5 * 60 * 1000;
const SECRET_POLL_MAX_RESCHEDULES = 5;
const PENDING_RECOVERY_WINDOW_MS = 2 * 60 * 60 * 1000;
const DEFAULT_FUSION_SECRET_STATE_TTL_SECONDS = 2 * 60 * 60;

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
  private readonly sdk: SDK;
  private readonly activeSecretPollers = new Map<string, NodeJS.Timeout>();
  private readonly secretPollReschedules = new Map<string, number>();
  private isRecoveringPendingOrders = false;

  constructor(
    private readonly swapOrderService: SwapOrderService,
    private readonly redisService: RedisService,
    private readonly firebaseNotificationService: FirebaseNotificationService,
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

    const parsed = this.parseSecretState(rawStr);
    if (!parsed) {
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
  } {
    return {
      ...state,
      submittedIdx: new Set(state.submittedIdx || []),
    };
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
      const { quoteId, walletAddress, secretCount } = fusionPlusOrder;
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
      };

      const response = await axios.post(
        `${process.env.FUSION_PLUS_QUOTER_BASE}/quote/build/evm`,
        body,
        config,
      );

      return response.data;
    } catch (error) {
      await this.delSecretState(`quote:${fusionPlusOrder.quoteId}`);
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to build swap';
      throw new BadRequestException(message);
    }
  }

  async submitFusionOrder(_device: any, submitOrderDto: SubmitOrderDto) {
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
      const message =
        error.response?.data?.description ||
        error.response?.data ||
        'unable to submit order';
      throw new BadRequestException(message);
    }
  }

  async submitFusionPlusOrder(_device: any, submitOrderDto: SubmitOrderDto) {
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

      const rawSecretsStr = await this.redisService.getKey(
        `fusion_secrets:${quoteId}`,
      );
      if (rawSecretsStr) {
        try {
          const rawSecrets = JSON.parse(rawSecretsStr);
          encryptFusionSecrets(rawSecrets);
          await this.redisService.delKey(`fusion_secrets:${quoteId}`);
        } catch {
          await this.redisService.delKey(`fusion_secrets:${quoteId}`);
        }
      }

      this.startSecretRevealPoller(orderHash);

      return response.data;
    } catch (error: any) {
      await this.delSecretState(tempKey);
      await this.delSecretState(orderHash);
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

  private getSecretStateTtlSeconds(): number {
    const configuredTtlSeconds = Number(
      process.env.FUSION_SECRET_STATE_TTL_SECONDS,
    );
    return Number.isFinite(configuredTtlSeconds) && configuredTtlSeconds > 0
      ? configuredTtlSeconds
      : DEFAULT_FUSION_SECRET_STATE_TTL_SECONDS;
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
    } catch {
      return;
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

  private async exhaustSecretRevealPoller(orderHash: string): Promise<boolean> {
    try {
      await this.updateOrderStatusAndNotify(
        orderHash,
        SwapOrderStatus.EXHAUSTED,
      );
      this.stopSecretRevealPoller(orderHash);
      return true;
    } catch {
      return false;
    }
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

    const rescheduleOrExhaust = async (delayMs: number): Promise<void> => {
      const rescheduleCount = this.secretPollReschedules.get(orderHash) ?? 0;

      if (rescheduleCount >= SECRET_POLL_MAX_RESCHEDULES) {
        await this.exhaustSecretRevealPoller(orderHash);
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
          for (const { idx } of data.fills) {
            if (secretState.submittedIdx.has(idx)) {
              continue;
            }

            const secret = secretState.secrets[idx];
            if (!secret) {
              continue;
            }

            await this.sdk.submitSecret(orderHash, secret);
            secretState.submittedIdx.add(idx);
            stateUpdated = true;
          }

          if (stateUpdated) {
            await this.setSecretState(orderHash, secretState);
          }

          retryDelayMs = SECRET_POLL_INTERVAL_MS;
          await rescheduleOrExhaust(retryDelayMs);
          return;
        }

        if (status === SDKOrderStatus.Refunding) {
          await this.updateOrderStatusAndNotify(
            orderHash,
            SwapOrderStatus.REFUNDING,
          );

          retryDelayMs = SECRET_POLL_INTERVAL_MS;
          await rescheduleOrExhaust(retryDelayMs);
          return;
        }

        if (FINAL_ORDER_STATUSES.has(status)) {
          const resolvedStatus = this.mapFusionPlusStatus(status);
          await this.updateOrderStatusAndNotify(orderHash, resolvedStatus);
          await this.delSecretState(orderHash);
          this.stopSecretRevealPoller(orderHash);
          return;
        }

        retryDelayMs = SECRET_POLL_INTERVAL_MS;
        await rescheduleOrExhaust(retryDelayMs);
      } catch {
        retryDelayMs = Math.min(
          retryDelayMs + SECRET_POLL_RETRY_STEP_MS,
          SECRET_POLL_MAX_RETRY_DELAY_MS,
        );
        await rescheduleOrExhaust(retryDelayMs);
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
        return;
      }

      const { data: pending } = result;
      if (!pending.length) {
        return;
      }

      for (const order of pending) {
        if (this.activeSecretPollers.has(order.txHash)) {
          continue;
        }

        const secretState = await this.getSecretState(order.txHash);
        if (!secretState) {
          continue;
        }

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
        await this.swapOrderService.updateOrderByHash({
          txHash: inchOrderStatusDto.orderHash,
          orderStatus: SwapOrderStatus[response.data.status.toUpperCase()],
        });
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
        await this.swapOrderService.updateOrderByHash({
          txHash: inchOrderStatusDto.orderHash,
          orderStatus: SwapOrderStatus[response.data.status.toUpperCase()],
        });
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
    } catch {
      throw new BadRequestException('unable to send notification');
    }
  }
}
