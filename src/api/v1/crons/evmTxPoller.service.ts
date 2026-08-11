import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SwapOrderRepository } from '../swapOrders/swapOrder.repository';
import { ExhaustedOrderRepository } from '../swapOrders/exhaustedOrder.repository';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { SwapOrders } from '../swapOrders/schema/swapOrder.schema';
import { NotificationDto } from '../notification/dto/notification.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { RedisService } from '../redis/redis.service';
import { TxReceiptStatusService } from './txReceiptStatus.service';


const BATCH_SIZE = 10;

// Mirrors the retry shape used by the 1inch / NEAR intent pollers: a bounded
// number of "not yet mined" misses, each pushing the next check further out,
// before the order is parked in ExhaustedOrders for the reconciler cron.
const MAX_POLL_ATTEMPTS = 5;
const POLL_BACKOFF_STEP_MS = 30_000;
const POLL_BACKOFF_MAX_MS = 5 * 60_000;
const POLL_STATE_TTL_SECONDS = 30 * 60;

interface PollState {
    attempts: number;
    nextPollAt: number;
}

@Injectable()
export class EvmTxPollerService {
    private readonly logger = new Logger(EvmTxPollerService.name);
    private isRunning = false;

    constructor(
        private readonly repo: SwapOrderRepository,
        private readonly exhaustedOrderRepository: ExhaustedOrderRepository,
        private readonly firebaseNotificationService: FirebaseNotificationService,
        private readonly redisService: RedisService,
        private readonly txReceiptStatusService: TxReceiptStatusService,
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

    private redisKey(txHash: string): string {
        return `evm_tx_poll:${txHash}`;
    }

    private async getPollState(txHash: string): Promise<PollState> {
        const raw = await this.redisService.getKey(this.redisKey(txHash));
        if (!raw) return { attempts: 0, nextPollAt: 0 };
        try {
            return JSON.parse(raw) as PollState;
        } catch {
            return { attempts: 0, nextPollAt: 0 };
        }
    }

    private async savePollState(txHash: string, state: PollState): Promise<void> {
        await this.redisService.setKey(this.redisKey(txHash), JSON.stringify(state), POLL_STATE_TTL_SECONDS);
    }

    private async clearPollState(txHash: string): Promise<void> {
        await this.redisService.delKey(this.redisKey(txHash));
    }

    private async processTx(tx: SwapOrders): Promise<void> {
        const state = await this.getPollState(tx.txHash);
        if (state.nextPollAt && Date.now() < state.nextPollAt) {
            this.logger.debug(`EvmTx ${tx.txHash} backing off, next check at ${new Date(state.nextPollAt).toISOString()}`);
            return;
        }

        const newStatus = await this.txReceiptStatusService.getStatus(tx.fromChain, tx.txHash);
        if (!newStatus) {
            await this.handleNotFound(tx, state);
            return;
        }

        const dbResult = await this.repo.updateOrderStatus(tx.txHash, newStatus);
        if (!dbResult) {
            this.logger.error(`EvmTx failed to update txHash ${tx.txHash} ${dbResult}`,);
            return;
        }

        await this.clearPollState(tx.txHash);
        this.logger.log(`EvmTx ${tx.txHash} ${tx.fromChain} to ${newStatus}`,);
        this.processTxNotification(tx, newStatus, dbResult.txType);
    }

    private async handleNotFound(tx: SwapOrders, state: PollState): Promise<void> {
        const attempts = state.attempts + 1;

        if (attempts >= MAX_POLL_ATTEMPTS) {
            this.logger.warn(`EvmTx ${tx.txHash} not found after ${attempts} attempts, marking EXHAUSTED`);
            await this.repo.updateOrderStatus(tx.txHash, SwapOrderStatus.EXHAUSTED);
            await this.exhaustedOrderRepository.upsertByTxHash(tx.txHash, {
                provider: swapProvider.EVMTX,
                deviceFcmToken: tx.deviceFcmToken ?? null,
            });
            await this.clearPollState(tx.txHash);
            return;
        }

        const delayMs = Math.min(POLL_BACKOFF_STEP_MS * attempts, POLL_BACKOFF_MAX_MS);
        await this.savePollState(tx.txHash, { attempts, nextPollAt: Date.now() + delayMs });
        this.logger.debug(
            `EvmTx ${tx.txHash} not yet mined on ${tx.fromChain} (attempt ${attempts}/${MAX_POLL_ATTEMPTS}), next check in ${delayMs / 1000}s`,
        );
    }

    private async processTxNotification(tx: SwapOrders, status: string, txType: string): Promise<void> {
        const notificationPayload: NotificationDto = {
                title: `Order Completed: ${tx.amountOut} ${tx.toToken}`,
                body: `From ${tx.walletAddress?.slice(0, 4)}.....${tx.walletAddress?.slice(-4)}`,
                data: {"network":tx.fromChain,"txHash":tx.txHash},
            };
        await this.firebaseNotificationService.sendNotification(
            tx.deviceFcmToken as string,
            notificationPayload,
        );
    }
}
