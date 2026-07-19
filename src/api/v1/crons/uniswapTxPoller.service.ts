import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SwapOrderRepository } from '../swapOrders/swapOrder.repository';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrders } from '../swapOrders/schema/swapOrder.schema';
import { NotificationDto } from '../notification/dto/notification.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import {
  getProviderHttpTimeoutMs,
  withProviderRetry,
} from '../common/utils/retry.util';
import {
  getBlockscoutAllowedHosts,
  validateOptionalProviderUrl,
} from '../common/config/provider-url.config';

const BATCH_SIZE = 10;

interface BlockscoutReceiptResponse {
  status: '0' | '1';
  message: string;
  result: {
    status: '0' | '1';
  } | null;
}

function mapBlockscoutStatus(
  result: BlockscoutReceiptResponse,
): SwapOrderStatus | null {
  if (result.status === '0' || !result.result) {
    return SwapOrderStatus.FAILED;
  }

  const txStatus = result.result.status;

  if (txStatus === '0') {
    return SwapOrderStatus.FAILED;
  }

  if (txStatus === '1' || txStatus === '') {
    return SwapOrderStatus.COMPLETED;
  }

  return null;
}

@Injectable()
export class UniswapTxPollerService {
  private readonly BLOCKSCOUT_URLS: Partial<Record<string, string>>;
  private readonly logger = new Logger(UniswapTxPollerService.name);
  private isRunning = false;

  constructor(
    private readonly repo: SwapOrderRepository,
    private readonly firebaseNotificationService: FirebaseNotificationService,
  ) {
    this.BLOCKSCOUT_URLS = this.getValidatedBlockscoutUrls();
  }

  private getValidatedBlockscoutUrls(): Partial<Record<string, string>> {
    const allowedHosts = getBlockscoutAllowedHosts();
    return {
      ETH: validateOptionalProviderUrl(process.env.BLOCKSCOUT_ETH, {
        source: 'BLOCKSCOUT_ETH',
        allowedHosts,
      }),
      BSC: validateOptionalProviderUrl(process.env.BLOCKSCOUT_BSC, {
        source: 'BLOCKSCOUT_BSC',
        allowedHosts,
      }),
      POL: validateOptionalProviderUrl(process.env.BLOCKSCOUT_POL, {
        source: 'BLOCKSCOUT_POL',
        allowedHosts,
      }),
      ARB: validateOptionalProviderUrl(process.env.BLOCKSCOUT_ARB, {
        source: 'BLOCKSCOUT_ARB',
        allowedHosts,
      }),
      OPT: validateOptionalProviderUrl(process.env.BLOCKSCOUT_OPT, {
        source: 'BLOCKSCOUT_OPT',
        allowedHosts,
      }),
      BASE: validateOptionalProviderUrl(process.env.BLOCKSCOUT_BAS, {
        source: 'BLOCKSCOUT_BAS',
        allowedHosts,
      }),
      AVAX: validateOptionalProviderUrl(process.env.BLOCKSCOUT_AVA, {
        source: 'BLOCKSCOUT_AVA',
        allowedHosts,
      }),
    };
  }

  @Cron('*/15 * * * * *', { name: 'Uniswap-Cron' })
  async poll(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('uniswap previous tick still running');
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.repo.findPendingByProvider(
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
    const chainKey = tx.fromChain?.toUpperCase();
    const baseUrl = this.BLOCKSCOUT_URLS[chainKey];

    if (!baseUrl) {
      this.logger.warn(
        `No blockscout URL for chain ${tx.fromChain} txHash ${tx.txHash}`,
      );
      return;
    }

    let response: BlockscoutReceiptResponse;
    try {
      const url =
        `${baseUrl}/api` +
        `?module=transaction` +
        `&action=gettxreceiptstatus` +
        `&txhash=${encodeURIComponent(tx.txHash)}`;

      const res = await withProviderRetry(async () => {
        const response = await fetch(url, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(getProviderHttpTimeoutMs()),
        });
        if (
          !response.ok &&
          (response.status === 408 ||
            response.status === 429 ||
            response.status >= 500)
        ) {
          const error = new Error(`blockscout HTTP ${response.status}`);
          (error as any).response = { status: response.status };
          throw error;
        }

        return response;
      });

      if (!res.ok) {
        this.logger.warn(
          `blockscout HTTP ${res.status} for txHash ${tx.txHash} chain ${tx.fromChain}`,
        );
        return;
      }

      response = (await res.json()) as BlockscoutReceiptResponse;
    } catch (err) {
      this.logger.error(
        `blockscout fetch error txHash ${tx.txHash} chain ${tx.fromChain}`,
        err,
      );
      return;
    }

    const newStatus = mapBlockscoutStatus(response);
    if (!newStatus) {
      this.logger.debug(
        `uniswap ${tx.txHash} not yet mined on ${tx.fromChain}`,
      );
      return;
    }

    const dbResult = await this.repo.updateOrderStatus(tx.txHash, newStatus);
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
