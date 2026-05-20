import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import WebSocket from 'ws';
import { SDK } from '@1inch/cross-chain-sdk';
import { SwapOrderService } from '../swapOrders/swapOrders.service';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { decryptFusionSecrets } from '../common/utils/encryption.util';

@Injectable()
export class InchFusionPlusWsPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InchFusionPlusWsPollerService.name);

  private ws: WebSocket;
  private sdk: SDK;
  private submittedSecrets = new Set<string>(); // Tracks submitted secrets as orderHash_idx
  private activeSubscriptions = new Set<string>();

  constructor(
    private swapOrderService: SwapOrderService
  ) {}

  async onModuleInit() {
    this.sdk = new SDK({
      url: 'https://api.1inch.dev/fusion-plus',
      authKey: process.env.INCH_API_KEY!,
    });

    this.initWsClient();
  }

  async onModuleDestroy() {
    if (this.ws) {
      this.ws.close();
    }
    this.activeSubscriptions.clear();
    this.submittedSecrets.clear();
  }

  private initWsClient() {
    this.ws = new WebSocket('wss://api.1inch.com/fusion-plus/ws/v1.2', {
      headers: {
        Authorization: `Bearer ${process.env.INCH_API_KEY!}`,
      },
    });

    this.ws.on('open', () => {
      this.logger.log('Fusion+ WS connected');
      // Resubscribe to all active subscriptions if we reconnected
      for (const orderHash of this.activeSubscriptions) {
        this.sendSubscribeCommand(orderHash);
      }
    });

    this.ws.on('message', async (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        const payload = message.payload;

        if (!payload) {
          return;
        }

        const { status, orderHash } = payload;
        
        if (!orderHash || !this.activeSubscriptions.has(orderHash)) {
            return; // Not tracking this order
        }

        this.logger.log(`[Fusion+] Order ${orderHash} → ${status}`);

        // CLAIMABLE STATES
        if (['dstEscrowCreated', 'filled'].includes(status)) {
          this.logger.log(`[Fusion+] Checking ready fills for ${orderHash}`);
          await this.revealReadySecrets(orderHash);
        }

        // FINAL STATES
        if (['claimed', 'refunded', 'expired', 'cancelled'].includes(status)) {
          this.logger.log(`[Fusion+] Final state ${status} for ${orderHash}`);
          await this.finalizeOrder(orderHash, status);
        }

      } catch (e) {
        this.logger.error(`WS message error: ${e.message}`, e.stack);
      }
    });

    this.ws.on('error', (err) => {
      this.logger.error(`Fusion+ WS error: ${String(err)}`);
    });

    this.ws.on('close', () => {
      this.logger.warn('Fusion+ WS closed — reconnecting in 5s');
      setTimeout(() => this.initWsClient(), 5000);
    });
  }

  // ─── Subscribe to a specific order ───────────────────────────────────────────

  async subscribeOrder(orderHash: string) {
    this.activeSubscriptions.add(orderHash);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribeCommand(orderHash);
    }
  }

  private sendSubscribeCommand(orderHash: string) {
    this.ws.send(
      JSON.stringify({
        action: 'subscribe',
        topic: 'order',
        filter: { orderHash },
      }),
    );
    this.logger.log(`[Fusion+] Subscribed ${orderHash}`);
  }

  // ─── Unsubscribe ─────────────────────────────────────────────────────────────

  private unsubscribeOrder(orderHash: string) {
    this.activeSubscriptions.delete(orderHash);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: 'unsubscribe',
          topic: 'order',
          filter: { orderHash },
        }),
      );
      this.logger.log(`[Fusion+] Unsubscribed ${orderHash}`);
    }
  }

  // ─── Reveal ready secrets ────────────────────────────────────────────────────

  private async revealReadySecrets(orderHash: string) {
    try {
      const readyFills = await this.sdk.getReadyToAcceptSecretFills(orderHash);

      if (!readyFills || !readyFills.fills || readyFills.fills.length === 0) {
        return;
      }

      // Fetch the order from DB to get the secrets
      const orderResult = await this.swapOrderService.findByTxHash(orderHash);
      if (!orderResult?.data) {
        this.logger.warn(`Order ${orderHash} not found in DB`);
        return;
      }

      const order = orderResult.data;
      if (!order.encryptedFusionSecrets) {
        this.logger.warn(`No encrypted secrets found for order ${orderHash}`);
        return;
      }

      const secrets = decryptFusionSecrets(order.encryptedFusionSecrets) as any[];

      for (const fill of readyFills.fills) {
        const idx = fill.idx;
        const secretKey = `${orderHash}_${idx}`;

        if (this.submittedSecrets.has(secretKey)) {
          this.logger.log(`Secret ${idx} already submitted for ${orderHash}`);
          continue;
        }

        const secretData = secrets[idx];
        if (!secretData) {
          this.logger.warn(`Secret missing for idx ${idx} on order ${orderHash}`);
          continue;
        }

        // Depending on how secrets were serialized before encryption, you may need to parse them.
        // E.g., if it was a Buffer serialized to JSON, it might be { type: 'Buffer', data: [...] }
        let secret: any = secretData;
        if (secretData.type === 'Buffer' && Array.isArray(secretData.data)) {
            secret = Buffer.from(secretData.data);
        } else if (typeof secretData === 'string' && !secretData.startsWith('0x')) {
            // Optional: convert hex string to buffer if needed, or pass as is if SDK accepts string
            secret = Buffer.from(secretData, 'hex');
        }

        this.logger.log(`Submitting secret idx=${idx} for ${orderHash}`);

        await this.sdk.submitSecret(orderHash, secret);

        this.logger.log(`Secret submitted idx=${idx} for ${orderHash}`);
        this.submittedSecrets.add(secretKey);
      }

    } catch (e) {
      this.logger.error(`Reveal secret error for ${orderHash}: ${e.message}`, e.stack);
    }
  }

  // ─── Finalize: update DB + unsubscribe ───────────────────────────────────────

  private async finalizeOrder(orderHash: string, status: string) {
    try {
      await this.swapOrderService.updateOrderStatus(orderHash, this.mapEventToStatus(status));
      this.logger.log(`[Fusion+] Order ${orderHash} saved as ${status}`);
    } catch (err) {
      this.logger.error(`Failed to update order ${orderHash}: ${err.message}`);
    } finally {
      this.unsubscribeOrder(orderHash);
    }
  }

  private mapEventToStatus(status: string): SwapOrderStatus {
    const map: Record<string, SwapOrderStatus> = {
      claimed: SwapOrderStatus.COMPLETED,
      refunded: SwapOrderStatus.FAILED,
      expired: SwapOrderStatus.FAILED,
      cancelled: SwapOrderStatus.FAILED,
    };
    return map[status] ?? SwapOrderStatus.FAILED;
  }

  getActiveWatches() {
    return Array.from(this.activeSubscriptions);
  }
}
