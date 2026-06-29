import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SwapOrderRepository } from '../swapOrders/swapOrder.repository';
import { SwapOrders } from '../swapOrders/schema/swapOrder.schema';
import { SwapOrderStatus as OrderStatus, RangoOrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';
import { RangoService } from '../swap/rango/rango.service';
import { CheckTransactionApprovalDto } from '../swap/dto/confirmTransactionApprovalDto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { NotificationDto } from '../notification/dto/notification.dto';

interface RangoStatusResponse {
    status: RangoOrderStatus;
    error?: string | null;
    bridgeData?: {
        destTxHash?: string;
        destBlockNumber?: number;
    };
}

const notifiyUser: ReadonlySet<RangoOrderStatus> = new Set([
    RangoOrderStatus.SUCCEEDED,
    RangoOrderStatus.SUCCESS,
]);

function mapRangoStatus(s: RangoOrderStatus): OrderStatus | null {
    switch (s) {
        case RangoOrderStatus.SUCCEEDED:
        case RangoOrderStatus.SUCCESS:
            return OrderStatus.COMPLETED;
        case RangoOrderStatus.FAILED:
            return OrderStatus.FAILED;
        case RangoOrderStatus.RUNNING:
        case RangoOrderStatus.WAITING:
        default:
            return null;
    }
}

@Injectable()
export class RangoPollerService {
    private readonly logger = new Logger(RangoPollerService.name);
    private isRunning = false;

    constructor(
        private readonly repo: SwapOrderRepository,
        private readonly rangoService: RangoService,
        private readonly firebaseNotificationService: FirebaseNotificationService
    ) { }

    @Cron('* * * * *', { name: 'rango-poller' })
    async poll(): Promise<void> {
        if (this.isRunning) {
            this.logger.warn('rango poll previous tx still running skipping.');
            return;
        }

        this.isRunning = true;
        try {
            const result = await this.repo.findPendingByProvider(swapProvider.RANGO);
            if (!result.ok) {
                this.logger.error(`fetch failed: ${result.error}`);
                return;
            }

            const { data: pending } = result;
            if (!pending.length) return;

            this.logger.debug(`rango processing ${pending.length} pending txs`);

            const results = await Promise.allSettled(
                pending.map((tx) => this.processTx(tx)),
            );

            results.forEach((r, i) => {
                if (r.status === 'rejected') {
                    this.logger.error(`rango tx[${i}] rejection`, r.reason);
                }
            });
        } finally {
            this.isRunning = false;
        }
    }

    private async processTx(tx: SwapOrders): Promise<void> {
        let rangoData: RangoStatusResponse;
        try {
            const { requestId, txHash } = tx;
            const res = await this.rangoService.checkTransactionStatus({ requestId: requestId, txId: txHash, step: 1 } as CheckTransactionApprovalDto)
            rangoData = res as RangoStatusResponse;
        } catch (err) {
            this.logger.error(`rango API fetch error for txHash ${tx.txHash}`, err);
            return;
        }

        const newStatus = mapRangoStatus(rangoData.status);
        if (!newStatus) {
            this.logger.debug(
                `rango tx ${tx.txHash} rangoStatus ${rangoData.status}`,
            );
            return;
        }

        const dbResult = await this.repo.updateStatus(
            tx.txHash,
            newStatus,
            rangoData.bridgeData?.destBlockNumber ?? null,
        );

        if (!dbResult.ok) {
            this.logger.error(
                `failed to update txHash ${tx.txHash}: ${dbResult.error}`,
            );
            return;
        }

        this.logger.log(`rango tx ${tx.txHash} = ${newStatus}`);
        if (rangoData.status && notifiyUser.has(rangoData.status)) {
            await this.processTxNotification(tx)
        }
    }
    private async processTxNotification(tx: SwapOrders): Promise<void> {
        const notificationPayload: NotificationDto = {
            title: `Rango Tx Update`,
            body: `Order update ${tx.amountOut} amout has been marked as ${RangoOrderStatus.SUCCESS}.`,
            data: {},
        };
        await this.firebaseNotificationService.sendNotification(
            tx.deviceFcmToken as string,
            notificationPayload,
        );
    }
}