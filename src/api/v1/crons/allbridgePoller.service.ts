import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
    AllbridgeCoreSdk,
    nodeRpcUrlsDefault,
    TransferStatusResponse,
    ChainSymbol,
} from '@allbridge/bridge-core-sdk';
import { SwapOrderRepository } from '../swapOrders/swapOrder.repository';
import { SwapOrders } from '../swapOrders/schema/swapOrder.schema';
import { SwapOrderStatus as OrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';
import { NotificationDto } from '../notification/dto/notification.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';

function mapAllbridgeStatus(
    res: TransferStatusResponse | null | undefined,
): OrderStatus | null {
    if (!res) return null;
    if (res.receive?.txId) return OrderStatus.COMPLETED;
    return null;
}

@Injectable()
export class AllbridgePollerService {
    private readonly logger = new Logger(AllbridgePollerService.name);
    private isRunning = false;
    private readonly sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);

    constructor(
        private readonly repo: SwapOrderRepository,
        private readonly firebaseNotificationService: FirebaseNotificationService
    ) { }

    @Cron('* * * * *', { name: 'allbridge-poller' })
    async poll(): Promise<void> {
        if (this.isRunning) {
            this.logger.warn('allbridge poll previous tx still running skipping.');
            return;
        }

        this.isRunning = true;
        try {
            const result = await this.repo.findPendingByProvider(swapProvider.ALLBRIDGE);
            if (!result.ok) {
                this.logger.error(`fetch failed: ${result.error}`);
                return;
            }

            const { data: pending } = result;
            if (!pending.length) return;

            this.logger.debug(`allbridge processing ${pending.length} pending tx`);
            const results = await Promise.allSettled(
                pending.map((tx) => this.processTx(tx)),
            );

            results.forEach((r, i) => {
                if (r.status === 'rejected') {
                    this.logger.error(`allbridge tx[${i}] rejection`, r.reason);
                }
            });
        } finally {
            this.isRunning = false;
        }
    }

    private async processTx(tx: SwapOrders): Promise<void> {
        let transferStatus: TransferStatusResponse;
        try {
            transferStatus = await this.sdk.getTransferStatus(
                tx.fromChain as ChainSymbol,
                tx.txHash,
            );
        } catch (err) {
            this.logger.error(
                `allbridge SDK error for txHash ${tx.txHash} chain ${tx.fromChain}`,
                err,
            );
            return;
        }

        const newStatus = mapAllbridgeStatus(transferStatus);
        if (!newStatus) {
            this.logger.debug(
                `allbridge tx ${tx.txHash} still bridging no receive.txId.`,
            );
            return;
        }

        const dbResult = await this.repo.updateStatus(
            tx.txHash,
            newStatus,
            null,
        );

        if (!dbResult.ok) {
            this.logger.error(
                `failed to update txHash ${tx.txHash}: ${dbResult.error}`,
            );
            return;
        }

        this.logger.log(`allbridge tx ${tx.txHash} = ${newStatus}`);
        if (newStatus===OrderStatus.COMPLETED) {
            await this.processTxNotification(tx)
        }
    }
    private async processTxNotification(tx: SwapOrders): Promise<void> {
            const notificationPayload: NotificationDto = {
                title: `Received: ${tx.amountOut} ${tx.toToken}`,
                body: `From ${tx.walletAddress?.slice(0, 4)}.....${tx.walletAddress?.slice(-4)}`,
                data: {"network":tx.fromChain,"txHash":tx.txHash},
            };
            await this.firebaseNotificationService.sendNotification(
                tx.deviceFcmToken as string,
                notificationPayload,
            );
        }
}