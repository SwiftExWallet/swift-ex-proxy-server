import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SwapOrderService } from '../swapOrders/swapOrders.service';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrders } from '../swapOrders/schema/swapOrder.schema';
import { NotificationDto } from '../notification/dto/notification.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { TxReceiptStatusService } from './txReceiptStatus.service';

const BATCH_SIZE = 10;

@Injectable()
export class UniswapTxPollerService {
  private readonly logger = new Logger(UniswapTxPollerService.name);
  private isRunning = false;

  constructor(
    private readonly swapOrderService: SwapOrderService,
    private readonly firebaseNotificationService: FirebaseNotificationService,
    private readonly txReceiptStatusService: TxReceiptStatusService,
  ) {}

  @Cron('*/15 * * * * *', { name: 'Uniswap-Cron' })
  async poll(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('uniswap previous tick still running');
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.swapOrderService.findPendingByProvider(
        swapProvider.UNISWAP,
      );
      if (!result.ok) {
        this.logger.error(`uniswap fetch failed: ${result.error}`);
        return;
      }

      const { data: pending } = result;
      if (!pending.length) return;

      this.logger.debug(`${pending.length} pending uniswap found`);

      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((tx) => this.processTx(tx)),
        );

        results.forEach((r, idx) => {
          if (r.status === 'rejected') {
            this.logger.error(
              `uniswap batch ${i + idx} unexpected rejection`,
              r.reason,
            );
          }
        });
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async processTx(tx: SwapOrders): Promise<void> {
    const newStatus = await this.txReceiptStatusService.getStatus(
      tx.fromChain,
      tx.txHash,
    );
    if (!newStatus) {
      this.logger.debug(
        `uniswap ${tx.txHash} not yet mined on ${tx.fromChain}`,
      );
      return;
    }

    const dbResult = await this.swapOrderService.updateOrderByHash({
      txHash: tx.txHash,
      orderStatus: newStatus,
    });
    if (!dbResult) {
      this.logger.error(
        `uniswap failed to update txHash ${tx.txHash} ${dbResult}`,
      );
      return;
    }

    this.logger.log(`uniswap ${tx.txHash} ${tx.fromChain} to ${newStatus}`);
    this.processTxNotification(tx);
  }

  private async processTxNotification(tx: SwapOrders): Promise<void> {
    if (!tx.deviceFcmToken) return;

    const notificationPayload: NotificationDto = {
      title: `Order Completed: ${tx.amountOut} ${tx.toToken}`,
      body: `From ${tx.walletAddress?.slice(0, 4)}.....${tx.walletAddress?.slice(-4)}`,
      data: { network: tx.fromChain, txHash: tx.txHash },
    };
    await this.firebaseNotificationService.sendNotification(
      tx.deviceFcmToken,
      notificationPayload,
    );
  }
}
