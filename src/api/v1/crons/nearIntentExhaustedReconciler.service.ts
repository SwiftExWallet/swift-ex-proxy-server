import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OneClickService, GetExecutionStatusResponse } from '@defuse-protocol/one-click-sdk-typescript';
import { ExhaustedOrder } from '../swapOrders/schema/exhaustedOrder.schema';
import { SwapOrderRepository } from '../swapOrders/swapOrder.repository';
import { SwapOrders } from '../swapOrders/schema/swapOrder.schema';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';
import { NotificationDto } from '../notification/dto/notification.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';

const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;

const TERMINAL_STATUS_MAP: Record<string, SwapOrderStatus> = {
  SUCCESS: SwapOrderStatus.COMPLETED,
  FAILED: SwapOrderStatus.FAILED,
  REFUNDED: SwapOrderStatus.REFUNDED,
};

@Injectable()
export class NearIntentExhaustedReconcilerService {
  private readonly logger = new Logger(NearIntentExhaustedReconcilerService.name);
  private isRunning = false;

  constructor(
    @InjectModel(ExhaustedOrder.name)
    private readonly exhaustedModel: Model<ExhaustedOrder>,
    private readonly repo: SwapOrderRepository,
    private readonly firebaseNotificationService: FirebaseNotificationService,
  ) {}

  @Cron('0 */4 * * *', { name: 'near-intent-exhausted-reconciler' })
  async poll(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('near intent exhausted reconciliation previous run still in progress, skipping.');
      return;
    }

    this.isRunning = true;
    try {
      const since = new Date(Date.now() - RECONCILE_WINDOW_MS);
      const pending = await this.exhaustedModel
        .find({ provider: swapProvider.NEARINTENT, exhaustedAt: { $gte: since } })
        .lean()
        .exec();
      if (!pending.length) return;

      this.logger.log(`near intent reconciliation processing ${pending.length} exhausted order(s)`);
      const results = await Promise.allSettled(pending.map((order) => this.reconcileOrder(order)));

      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          this.logger.error(`near intent reconciliation order[${i}] rejection`, r.reason);
        }
      });
    } finally {
      this.isRunning = false;
    }
  }

  private async reconcileOrder(order: ExhaustedOrder & { txHash: string }): Promise<void> {
    let status: GetExecutionStatusResponse;
    try {
      status = order.memo
        ? await OneClickService.getExecutionStatus(order.txHash, order.memo)
        : await OneClickService.getExecutionStatus(order.txHash);
    } catch (err) {
      this.logger.error(`[${order.txHash}] getExecutionStatus failed during reconciliation`, err);
      return;
    }

    this.logger.log(`[${order.txHash}] Reconciliation current status: ${status.status}`);

    const newStatus = TERMINAL_STATUS_MAP[status.status];
    if (!newStatus) {
      this.logger.log(`[${order.txHash}] Still unresolved (${status.status}), keeping for next reconciliation run`);
      return;
    }

    let updatedOrder: SwapOrders | null;
    try {
      updatedOrder = await this.repo.updateOrderStatus(order.txHash, newStatus);
    } catch (err) {
      this.logger.error(`[${order.txHash}] Failed to update swap order during reconciliation`, err);
      return;
    }

    this.logger.log(`[${order.txHash}] Reconciled exhausted order -> ${newStatus}`);
    await this.notify(updatedOrder, newStatus);

    await this.exhaustedModel.deleteOne({ txHash: order.txHash });
    this.logger.log(`[${order.txHash}] Removed from ExhaustedOrders`);
  }

  private async notify(order: SwapOrders | null, status: SwapOrderStatus): Promise<void> {
    if (!order?.deviceFcmToken) return;

    const notificationPayload: NotificationDto = {
      title: `Order ${status}: ${order.amountOut} ${order.toToken}`,
      body: `From ${order.walletAddress?.slice(0, 4)}.....${order.walletAddress?.slice(-4)}`,
      data: { network: order.fromChain || '', txHash: order.txHash || '' },
    };

    try {
      await this.firebaseNotificationService.sendNotification(order.deviceFcmToken as string, notificationPayload);
    } catch (err) {
      this.logger.error(`[${order.txHash}] Failed to send ${status} notification`, err);
    }
  }
}
