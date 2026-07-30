import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExhaustedOrderRepository } from '../swapOrders/exhaustedOrder.repository';
import { swapProvider } from '../common/enums/chain.enum';
import { InchService } from '../swap/1inch/1inch.service';

const RECONCILE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

@Injectable()
export class FusionPlusExhaustedReconcilerService {
  private readonly logger = new Logger(FusionPlusExhaustedReconcilerService.name);
  private isRunning = false;

  constructor(
    private readonly exhaustedOrderRepository: ExhaustedOrderRepository,
    private readonly inchService: InchService,
  ) {}

  @Cron('0 */4 * * *', { name: 'fusion-plus-exhausted-reconciler' })
  async poll(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('fusion+ exhausted reconciliation previous run still in progress, skipping.');
      return;
    }

    this.isRunning = true;
    try {
      const since = new Date(Date.now() - RECONCILE_WINDOW_MS);
      const pending = await this.exhaustedOrderRepository.findPendingSince(
        swapProvider.ONEINCH_FUSION_PLUS,
        since,
      );
      if (!pending.length) return;

      this.logger.log(`fusion+ reconciliation processing ${pending.length} exhausted order(s)`);
      for (const order of pending) {
        try {
          const resumed = await this.inchService.resumeSecretRevealPolling(order.txHash);
          if (!resumed) {
            this.logger.warn(
              `[${order.txHash}] fusion+ reconciliation could not resume (no secret state in redis)`,
            );
          }
        } catch (err) {
          this.logger.error(`[${order.txHash}] fusion+ reconciliation failed`, err);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
