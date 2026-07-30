import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  OneClickService,
  OpenAPI,
  GetExecutionStatusResponse,
} from '@defuse-protocol/one-click-sdk-typescript';
import { SwapOrderService } from '../../swapOrders/swapOrders.service';
import { RedisService } from '../../redis/redis.service';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { SwapOrderStatus } from '../../common/enums/order.enum';
import { swapProvider } from '../../common/enums/chain.enum';
import { ExhaustedOrder } from '../../swapOrders/schema/exhaustedOrder.schema';

interface NearIntentRedisState {
  memo?: string;
}

const POLL_INTERVAL_START_MS = 5_000;
const POLL_INTERVAL_STEP_MS = 5_000;
const POLL_INTERVAL_MAX_MS = 60_000;
const MAX_POLL_ATTEMPTS = 30;
const MAX_ERROR_RETRIES = 10;
const REDIS_TTL_SECONDS = 20 * 60; // 20 minutes — comfortably covers the worst-case poll duration with backoff
const RECOVERY_WINDOW_MS = 30 * 60 * 1000;

const TERMINAL_STATES: ReadonlySet<string> = new Set(['SUCCESS', 'REFUNDED', 'FAILED']);

const STATUS_MAP: Record<string, SwapOrderStatus> = {
  SUCCESS: SwapOrderStatus.COMPLETED,
  FAILED: SwapOrderStatus.FAILED,
  REFUNDED: SwapOrderStatus.REFUNDED,
};

@Injectable()
export class NearIntentPollerService implements OnModuleInit {
  private readonly logger = new Logger(NearIntentPollerService.name);
  private readonly activePolls = new Set<string>();

  constructor(
    @Inject(forwardRef(() => SwapOrderService))
    private readonly swapOrderService: SwapOrderService,
    private readonly redisService: RedisService,
    private readonly firebaseNotificationService: FirebaseNotificationService,
    @InjectModel(ExhaustedOrder.name)
    private readonly exhaustedOrderModel: Model<ExhaustedOrder>,
  ) {
    if (process.env.ONECLICK_BASE_URL) {
      OpenAPI.BASE = process.env.ONECLICK_BASE_URL;
    }
    if (process.env.ONECLICK_JWT_TOKEN) {
      OpenAPI.TOKEN = "";
    }
  }

  async onModuleInit(): Promise<void> {
    await this.recoverPendingOrders();
  }

  private redisKey(depositAddress: string): string {
    return `near_intent:${depositAddress}`;
  }

  private getErrorMessage(err: unknown): unknown {
    return err instanceof Error ? err.message : err;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getPollDelayMs(attempt: number): number {
    return Math.min(POLL_INTERVAL_START_MS + (attempt - 1) * POLL_INTERVAL_STEP_MS, POLL_INTERVAL_MAX_MS);
  }

  // ─── Kick off polling for a freshly stored NEARINTENT order ─────────────────

  async startPolling(depositAddress: string, memo?: string): Promise<void> {
    if (this.activePolls.has(depositAddress)) {
      this.logger.warn(`[${depositAddress}] NEARINTENT poller already active, skipping duplicate start`);
      return;
    }

    if (memo) {
      const state: NearIntentRedisState = { memo };
      await this.redisService.setKey(this.redisKey(depositAddress), JSON.stringify(state), REDIS_TTL_SECONDS);
      this.logger.log(`[${depositAddress}] Saved memo to redis (ttl=${REDIS_TTL_SECONDS}s)`);
    }

    void this.runPollingCycle(depositAddress, memo);
  }

  // ─── Recover in-flight orders on process restart ─────────────────────────────

  private async recoverPendingOrders(): Promise<void> {
    const since = new Date(Date.now() - RECOVERY_WINDOW_MS);
    const result = await this.swapOrderService.findByProviderAndStatusesSince(
      swapProvider.NEARINTENT,
      [SwapOrderStatus.CREATED, SwapOrderStatus.PENDING],
      since,
    );

    if (!result.ok) {
      this.logger.error(`NEARINTENT startup recovery fetch failed: ${result.error}`);
      return;
    }

    for (const order of result.data) {
      if (this.activePolls.has(order.txHash)) continue;

      const raw = await this.redisService.getKey(this.redisKey(order.txHash));
      if (!raw) {
        this.logger.warn(`[${order.txHash}] No redis state found, skipping NEARINTENT recovery`);
        continue;
      }

      const { memo } = JSON.parse(raw) as NearIntentRedisState;
      this.logger.log(`[${order.txHash}] Recovering NEARINTENT poller on startup`);
      void this.runPollingCycle(order.txHash, memo);
    }
  }

  // ─── Core polling loop ────────────────────────────────────────────────────────

  private async runPollingCycle(depositAddress: string, memo?: string): Promise<{
    success: boolean;
    data: GetExecutionStatusResponse | null;
    error: string | null;
  }> {
    this.activePolls.add(depositAddress);
    let errorRetryCount = 0;

    try {
      for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
        this.logger.log(`[${depositAddress}] Poll attempt ${attempt}/${MAX_POLL_ATTEMPTS}`);

        let status: GetExecutionStatusResponse;
        try {
          status = memo
            ? await OneClickService.getExecutionStatus(depositAddress, memo)
            : await OneClickService.getExecutionStatus(depositAddress);
          errorRetryCount = 0;
        } catch (err) {
          errorRetryCount++;
          this.logger.error(
            `[${depositAddress}] getExecutionStatus error (error retry ${errorRetryCount}/${MAX_ERROR_RETRIES}): ${this.getErrorMessage(err)}`,
          );

          if (errorRetryCount >= MAX_ERROR_RETRIES) {
            this.logger.error(`[${depositAddress}] Max error retries exceeded, stopping poll`);
            await this.exhaustPolling(depositAddress, memo);
            return { success: false, data: null, error: 'max_error_retries_exceeded' };
          }

          await this.sleep(this.getPollDelayMs(attempt));
          continue;
        }

        this.logger.log(`[${depositAddress}] Current execution status: ${status.status}`);

        if (TERMINAL_STATES.has(status.status)) {
          await this.handleTerminalStatus(depositAddress, status);
          return { success: true, data: status, error: null };
        }

        await this.sleep(this.getPollDelayMs(attempt));
      }

      this.logger.warn(`[${depositAddress}] Max polling attempts (${MAX_POLL_ATTEMPTS}) exceeded without reaching a terminal state`);
      await this.exhaustPolling(depositAddress, memo);
      return { success: false, data: null, error: 'max_poll_attempts_exceeded' };
    } finally {
      this.activePolls.delete(depositAddress);
    }
  }

  // ─── Terminal-state handling (SUCCESS / FAILED / REFUNDED) ───────────────────

  private async handleTerminalStatus(depositAddress: string, status: GetExecutionStatusResponse): Promise<void> {
    const orderStatus = STATUS_MAP[status.status];

    await this.removeRedisState(depositAddress);
    await this.updateOrderStatusAndNotify(depositAddress, orderStatus);
  }

  private async exhaustPolling(depositAddress: string, memo?: string): Promise<void> {
    const orderStatusUpdate = await this.updateOrderStatusAndNotify(depositAddress, SwapOrderStatus.EXHAUSTED, false);
    await this.saveExhaustedForReconciliation(depositAddress, memo, orderStatusUpdate);
    await this.removeRedisState(depositAddress);
  }

  private async saveExhaustedForReconciliation(depositAddress: string, memo?: string, order?: any): Promise<void> {
    try {
      await this.exhaustedOrderModel.findOneAndUpdate(
        { txHash: depositAddress },
        {
          txHash: depositAddress,
          provider: swapProvider.NEARINTENT,
          memo: memo ?? null,
          exhaustedAt: new Date(),
          swapOrderId: order?._id ?? null,
          deviceFcmToken: order?.deviceFcmToken ?? null,
        },
        { upsert: true },
      );
      this.logger.log(`[${depositAddress}] Saved to ExhaustedOrders for reconciliation`);
    } catch (err) {
      this.logger.error(
        `[${depositAddress}] Failed to save exhausted order for reconciliation`,
        this.getErrorMessage(err),
      );
    }
  }

  private async removeRedisState(depositAddress: string): Promise<void> {
    await this.redisService.delKey(this.redisKey(depositAddress));
    this.logger.log(`[${depositAddress}] Removed redis entry`);
  }

  // ─── Order status + FCM notification, mirroring InchFusionPlusWsPollerService ──

  private async sendOrderStatusNotification(orderStatusUpdate: any, orderStatus: SwapOrderStatus): Promise<void> {
    if (!orderStatusUpdate?.deviceFcmToken) return;

    try {
      await this.firebaseNotificationService.sendNotification(orderStatusUpdate.deviceFcmToken as string, {
        title: `Order ${orderStatus}: ${orderStatusUpdate?.amountOut} ${orderStatusUpdate?.toToken}`,
        body: `From ${orderStatusUpdate?.walletAddress?.slice(0, 4)}.....${orderStatusUpdate?.walletAddress?.slice(-4)}`,
        data: {
          network: orderStatusUpdate?.fromChain || '',
          txHash: orderStatusUpdate?.txHash || '',
        },
      });
      this.logger.log(`[${orderStatusUpdate?.txHash}] Sent ${orderStatus} notification`);
    } catch (err) {
      this.logger.error(
        `[${orderStatusUpdate?.txHash}] Failed to send ${orderStatus} notification`,
        this.getErrorMessage(err),
      );
    }
  }

  private async updateOrderStatusAndNotify(depositAddress: string, orderStatus: SwapOrderStatus, notify = true): Promise<any> {
    const orderStatusUpdate = await this.swapOrderService.updateOrderByHash({
      txHash: depositAddress,
      orderStatus,
    });
    this.logger.log(`[${depositAddress}] Order status updated to ${orderStatus}`);
    if (notify) {
      await this.sendOrderStatusNotification(orderStatusUpdate, orderStatus);
    } else {
      this.logger.log(`[${depositAddress}] Skipping notification for ${orderStatus}`);
    }
    return orderStatusUpdate;
  }
}
