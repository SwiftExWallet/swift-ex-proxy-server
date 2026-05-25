import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SwapOrderRepository } from '../swapOrders/swapOrder.repository';
import { OrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrders } from '../swapOrders/schema/swapOrder.schema';
import { NotificationDto } from '../notification/dto/notification.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';


const BATCH_SIZE = 10;

interface BlockscoutReceiptResponse {
    status: '0' | '1';
    message: string;
    result: {
        status: '0' | '1';
    } | null;
}

function mapBlockscoutStatus(result: BlockscoutReceiptResponse): OrderStatus | null {
    if (result.status === '0' || !result.result) return null;
    return result.result.status === '1'
        ? OrderStatus.COMPLETED
        : OrderStatus.FAILED;
}

@Injectable()
export class EvmTxPollerService {
    private readonly BLOCKSCOUT_URLS: Record<string, string> = {
        ETH: process.env.BLOCKSCOUT_ETH as string,
        BSC: process.env.BLOCKSCOUT_BSC as string,
        POL: process.env.BLOCKSCOUT_POL as string,
        ARB: process.env.BLOCKSCOUT_ARB as string,
        OPT: process.env.BLOCKSCOUT_OPT as string,
        BASE: process.env.BLOCKSCOUT_BAS as string,
        AVAX: process.env.BLOCKSCOUT_AVA as string,
    };
    private readonly logger = new Logger(EvmTxPollerService.name);
    private isRunning = false;

    constructor(
        private readonly repo: SwapOrderRepository,
        private readonly firebaseNotificationService: FirebaseNotificationService
    ) { }

    @Cron('*/15 * * * * *', { name: 'EvmTx-Cron' })
    async poll(): Promise<void> {
        if (this.isRunning) {
            this.logger.warn('EvmTx previous tick still running');
            return;
        }

        this.isRunning = true;
        try {
            const result = await this.repo.findPendingByProvider(swapProvider.EVMTX);
            if (!result.ok) {
                this.logger.error(`EvmTx fetch failed: ${result.error}`);
                return;
            }

            const { data: pending } = result;
            if (!pending.length) return;

            this.logger.debug(`${pending.length} pending EvmTx found`);

            for (let i = 0; i < pending.length; i += BATCH_SIZE) {
                const batch = pending.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(
                    batch.map((tx) => this.processTx(tx)),
                );

                results.forEach((r, idx) => {
                    if (r.status === 'rejected') {
                        this.logger.error(`EvmTx batch ${i + idx} unexpected rejection`, r.reason,);
                    }
                });
            }
        } finally {
            this.isRunning = false;
        }
    }


    private async processTx(tx: SwapOrders): Promise<void> {
        const chainKey = tx.fromChain?.toUpperCase();
        const baseUrl = this.BLOCKSCOUT_URLS[chainKey];

        if (!baseUrl) {
            this.logger.warn(`No blockscout URL for chain ${tx.fromChain} txHash ${tx.txHash}`,);
            return;
        }

        let response: BlockscoutReceiptResponse;
        try {
            const url =
                `${baseUrl}/api` +
                `?module=transaction` +
                `&action=gettxreceiptstatus` +
                `&txhash=${encodeURIComponent(tx.txHash)}`;

            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(8_000),
            });

            if (!res.ok) {
                this.logger.warn(
                    `blockscout HTTP ${res.status} for txHash ${tx.txHash} chain ${tx.fromChain}`,
                );
                return;
            }

            response = (await res.json()) as BlockscoutReceiptResponse;
        } catch (err) {
            this.logger.error(`blockscout fetch error txHash ${tx.txHash} chain ${tx.fromChain}`, err,);
            return;
        }

        const newStatus = mapBlockscoutStatus(response);
        if (!newStatus) {
            this.logger.debug(`EvmTx ${tx.txHash} not yet mined on ${tx.fromChain}`,);
            return;
        }

        const dbResult = await this.repo.updateStatus(tx.txHash, newStatus);
        if (!dbResult.ok) {
            this.logger.error(`EvmTx failed to update txHash ${tx.txHash} ${dbResult.error}`,);
            return;
        }

        this.logger.log(`EvmTx ${tx.txHash} ${tx.fromChain} to ${newStatus}`,);
        this.processTxNotification(tx, newStatus);
    }

    private async processTxNotification(tx: SwapOrders, status: string): Promise<void> {
        const notificationPayload: NotificationDto = {
            title: `${tx.fromChain} Transaction Update`,
            body: `The transaction amount of ${tx.amountOut} has been updated to ${status}.`,
            data: {},
        };
        await this.firebaseNotificationService.sendNotification(
            tx.deviceFcmToken as string,
            notificationPayload,
        );
    }
}