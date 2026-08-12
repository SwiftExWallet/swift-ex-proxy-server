import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExhaustedOrderService } from '../swapOrders/exhaustedOrder.service';
import type { LeanExhaustedOrder } from '../swapOrders/exhaustedOrder.service';
import { SwapOrderService } from '../swapOrders/swapOrders.service';
import { swapProvider } from '../common/enums/chain.enum';
import { NotificationDto } from '../notification/dto/notification.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { TxReceiptStatusService } from './txReceiptStatus.service';

const RECONCILE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

@Injectable()
export class EvmTxExhaustedReconcilerService {
  private readonly logger = new Logger(EvmTxExhaustedReconcilerService.name);
  private isRunning = false;

  constructor(
    private readonly exhaustedOrderService: ExhaustedOrderService,
    private readonly swapOrderService: SwapOrderService,
    private readonly txReceiptStatusService: TxReceiptStatusService,
    private readonly firebaseNotificationService: FirebaseNotificationService,
  ) {}

  @Cron('0 */4 * * *', { name: 'evm-tx-exhausted-reconciler' })
  async poll(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'evm tx exhausted reconciliation previous run still in progress, skipping.',
      );
      return;
    }

    this.isRunning = true;
    try {
      const since = new Date(Date.now() - RECONCILE_WINDOW_MS);
      const pending = await this.exhaustedOrderService.findPendingSince(
        swapProvider.EVMTX,
        since,
      );
      if (!pending.length) return;

      this.logger.log(
        `evm tx reconciliation processing ${pending.length} exhausted order(s)`,
      );
      for (const order of pending) {
        try {
          await this.reconcileOrder(order);
        } catch (err) {
          this.logger.error(
            `[${order.txHash}] evm tx reconciliation failed`,
            err,
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async reconcileOrder(order: LeanExhaustedOrder): Promise<void> {
    const orderResult = await this.swapOrderService.findByTxHash(order.txHash);
    if (!orderResult.ok || !orderResult.data) {
      this.logger.warn(
        `[${order.txHash}] Could not load swap order, cannot reconcile`,
      );
      return;
    }

    const { fromChain } = orderResult.data;
    const newStatus = await this.txReceiptStatusService.getStatus(
      fromChain,
      order.txHash,
    );
    if (!newStatus) {
      this.logger.log(
        `[${order.txHash}] Still unresolved, keeping for next reconciliation run`,
      );
      return;
    }

    const updatedOrder = await this.swapOrderService.updateOrderByHash({
      txHash: order.txHash,
      orderStatus: newStatus,
    });
    this.logger.log(
      `[${order.txHash}] Reconciled exhausted order -> ${newStatus}`,
    );
    await this.notify(updatedOrder, newStatus);

    await this.exhaustedOrderService.deleteById(String(order._id));
    this.logger.log(`[${order.txHash}] Removed from ExhaustedOrders`);
  }

  private async notify(order: any, status: string): Promise<void> {
    if (!order?.deviceFcmToken) return;

    const notificationPayload: NotificationDto = {
      title: `Order ${status}: ${order.amountOut} ${order.toToken}`,
      body: `From ${order.walletAddress?.slice(0, 4)}.....${order.walletAddress?.slice(-4)}`,
      data: { network: order.fromChain || '', txHash: order.txHash || '' },
    };

    try {
      await this.firebaseNotificationService.sendNotification(
        order.deviceFcmToken as string,
        notificationPayload,
      );
    } catch (err) {
      this.logger.error(
        `[${order.txHash}] Failed to send ${status} notification`,
        err,
      );
    }
  }
}
