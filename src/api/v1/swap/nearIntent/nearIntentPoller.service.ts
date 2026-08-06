import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
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
import { ExhaustedOrderRepository } from '../../swapOrders/exhaustedOrder.repository';
import { PortfolioService } from '../../portfolio/portfolio.service';

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
  private readonly sourceRefreshTriggered = new Set<string>();

  constructor(
    @Inject(forwardRef(() => SwapOrderService))
    private readonly swapOrderService: SwapOrderService,
    private readonly redisService: RedisService,
    private readonly firebaseNotificationService: FirebaseNotificationService,
    private readonly exhaustedOrderRepository: ExhaustedOrderRepository,
    private readonly portfolioService: PortfolioService,
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

  private redisKey(orderId: string): string {
    return `near_intent:${orderId}`;
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

  async startPolling(depositAddress: string, orderId: string, memo?: string): Promise<void> {
    if (this.activePolls.has(orderId)) {
      this.logger.warn(`[${orderId}] NEARINTENT poller already active, skipping duplicate start`);
      return;
    }

    if (memo) {
      const state: NearIntentRedisState = { memo };
      await this.redisService.setKey(this.redisKey(orderId), JSON.stringify(state), REDIS_TTL_SECONDS);
      this.logger.log(`[${orderId}] Saved memo to redis (ttl=${REDIS_TTL_SECONDS}s)`);
    }

    void this.runPollingCycle(depositAddress, orderId, memo);
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
      const orderId = String(order._id);
      if (this.activePolls.has(orderId)) continue;

      const raw = await this.redisService.getKey(this.redisKey(orderId));
      if (!raw) {
        this.logger.warn(`[${orderId}] No redis state found, skipping NEARINTENT recovery`);
        continue;
      }

      const { memo } = JSON.parse(raw) as NearIntentRedisState;
      this.logger.log(`[${orderId}] Recovering NEARINTENT poller on startup`);
      void this.runPollingCycle(order.txHash, orderId, memo);
    }
  }

  // ─── Core polling loop ────────────────────────────────────────────────────────

  private async runPollingCycle(depositAddress: string, orderId: string, memo?: string): Promise<{
    success: boolean;
    data: GetExecutionStatusResponse | null;
    error: string | null;
  }> {
    this.activePolls.add(orderId);
    let errorRetryCount = 0;

    try {
      for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
        this.logger.log(`[${orderId}] Poll attempt ${attempt}/${MAX_POLL_ATTEMPTS}`);

        let status: GetExecutionStatusResponse;
        try {
          status = memo
            ? await OneClickService.getExecutionStatus(depositAddress, memo)
            : await OneClickService.getExecutionStatus(depositAddress);
          errorRetryCount = 0;
        } catch (err) {
          errorRetryCount++;
          this.logger.error(
            `[${orderId}] getExecutionStatus error (error retry ${errorRetryCount}/${MAX_ERROR_RETRIES}): ${this.getErrorMessage(err)}`,
          );

          if (errorRetryCount >= MAX_ERROR_RETRIES) {
            this.logger.error(`[${orderId}] Max error retries exceeded, stopping poll`);
            await this.exhaustPolling(orderId, depositAddress, memo);
            return { success: false, data: null, error: 'max_error_retries_exceeded' };
          }

          await this.sleep(this.getPollDelayMs(attempt));
          continue;
        }

        this.logger.log(`[${orderId}] Current execution status: ${status.status}`);

        if (status.status === 'PROCESSING' && !this.sourceRefreshTriggered.has(orderId)) {
          this.sourceRefreshTriggered.add(orderId);
          void this.refreshSourcePortfolio(orderId);
        }

        if (TERMINAL_STATES.has(status.status)) {
          await this.handleTerminalStatus(orderId, status);
          return { success: true, data: status, error: null };
        }

        await this.sleep(this.getPollDelayMs(attempt));
      }

      this.logger.warn(`[${orderId}] Max polling attempts (${MAX_POLL_ATTEMPTS}) exceeded without reaching a terminal state`);
      await this.exhaustPolling(orderId, depositAddress, memo);
      return { success: false, data: null, error: 'max_poll_attempts_exceeded' };
    } finally {
      this.activePolls.delete(orderId);
    }
  }

  // ─── Terminal-state handling (SUCCESS / FAILED / REFUNDED) ───────────────────

  private async handleTerminalStatus(orderId: string, status: GetExecutionStatusResponse): Promise<void> {
    const orderStatus = STATUS_MAP[status.status];

    await this.removeRedisState(orderId);
    this.sourceRefreshTriggered.delete(orderId);
    await this.updateOrderStatusAndNotify(orderId, orderStatus);
  }

  private async exhaustPolling(orderId: string, depositAddress: string, memo?: string): Promise<void> {
    const orderStatusUpdate = await this.updateOrderStatusAndNotify(orderId, SwapOrderStatus.EXHAUSTED, false);
    await this.saveExhaustedForReconciliation(orderId, depositAddress, memo, orderStatusUpdate);
    await this.removeRedisState(orderId);
    this.sourceRefreshTriggered.delete(orderId);
  }

  // PROCESSING means the deposit is confirmed and NEAR intents is now
  // executing the swap, so the sender's fromChain balance changes here —
  // before the order reaches a terminal status.
  private async refreshSourcePortfolio(orderId: string): Promise<void> {
    const result = await this.swapOrderService.findById(orderId);
    if (!result.ok || !result.data) {
      this.logger.warn(`[${orderId}] Could not load order for source portfolio refresh`);
      return;
    }

    const { deviceId, walletAddress, fromChain } = result.data;
    try {
      await this.portfolioService.refreshPortfolio(String(deviceId), walletAddress, [fromChain]);
    } catch (err) {
      this.logger.error(
        `[${orderId}] Failed to refresh source portfolio after PROCESSING`,
        this.getErrorMessage(err),
      );
    }
  }

  private async saveExhaustedForReconciliation(orderId: string, depositAddress: string, memo?: string, order?: any): Promise<void> {
    try {
      await this.exhaustedOrderRepository.upsertBySwapOrderId(orderId, {
        txHash: depositAddress,
        provider: swapProvider.NEARINTENT,
        memo: memo ?? null,
        deviceFcmToken: order?.deviceFcmToken ?? null,
      });
      this.logger.log(`[${orderId}] Saved to ExhaustedOrders for reconciliation`);
    } catch (err) {
      this.logger.error(
        `[${orderId}] Failed to save exhausted order for reconciliation`,
        this.getErrorMessage(err),
      );
    }
  }

  private async removeRedisState(orderId: string): Promise<void> {
    await this.redisService.delKey(this.redisKey(orderId));
    this.logger.log(`[${orderId}] Removed redis entry`);
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

  private async updateOrderStatusAndNotify(orderId: string, orderStatus: SwapOrderStatus, notify = true): Promise<any> {
    const orderStatusUpdate = await this.swapOrderService.updateOrderById(orderId, orderStatus);
    this.logger.log(`[${orderId}] Order status updated to ${orderStatus}`);
    if (notify) {
      await this.sendOrderStatusNotification(orderStatusUpdate, orderStatus);
    } else {
      this.logger.log(`[${orderId}] Skipping notification for ${orderStatus}`);
    }
    return orderStatusUpdate;
  }
}
