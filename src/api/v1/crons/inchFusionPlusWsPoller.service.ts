// fusion-watcher.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  WebSocketApi,
} from '@1inch/cross-chain-sdk';
import { SwapOrderService } from '../swapOrders/swapOrders.service';
import { SwapOrderStatus } from '../common/enums/order.enum';


interface OrderSubscription {
   orderHash: string;
  quoteId: string;
}

@Injectable()
export class InchFusionPlusWsPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InchFusionPlusWsPollerService.name);


private ws: WebSocketApi;
  // Track which orders we're watching: orderHash -> meta
  private activeSubscriptions = new Map<string, OrderSubscription>();

  constructor(
   private swapOrderService: SwapOrderService
  ) {}

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async onModuleInit() {
    this.initChainClient()
  }

  async onModuleDestroy() {
    this.ws.close();
    this.activeSubscriptions.clear();
  }

  // ─── Init one WS client per chain ────────────────────────────────────────────

  private initChainClient() {
    this.ws = new WebSocketApi({
      url: 'wss://api.1inch.dev/fusion-plus/ws/v1.2',
      authKey: process.env.INCH_API_KEY!,
    });
    
    this.ws.onOpen(() => {
      this.logger.log(`[fusion plus] WS connected`);
    });

    this.ws.onClose(() => {
      this.logger.warn(`[fusion plus] WS closed — reconnecting in 2 sec`);
      setTimeout(() => this.initChainClient(), 2000);
    });

    this.ws.onError((err) => {
      this.logger.error(`[fusion plus] WS error: ${String(err)}`);
    });

    // Central order event handler for this chain
    this.ws.order.onOrder(async (data) => {
      await this.handleOrderEvent(data);
    });


  }
  // ─── Subscribe to a specific order ───────────────────────────────────────────

  async subscribeOrder(orderHash: string, quoteId: string) {
    this.activeSubscriptions.set(orderHash, { orderHash, quoteId });

    //subscrive to particular order
    this.ws.send(
      JSON.stringify({
         action: 'subscribe',
         topic: 'order',
         filter: {
            orderHash
         }
      })
   );
    this.logger.log(` FUSION PLUS Watching order ${orderHash}`);
  }
//   async watchOrder(params: {
//   orderHash: string;
//   quoteId: string;
//   chainId: NetworkEnum;
// }) {
//   const { orderHash, quoteId, chainId } = params;

//   if (this.activeSubscriptions.has(orderHash)) return;

//   const ws = this.wsClients.get(chainId);
//   if (!ws) throw new Error(`No WS client for chainId ${chainId}`);

//   this.activeSubscriptions.set(orderHash, { chainId, orderHash, quoteId });

//   // Subscribe to specific order hash
//   ws.order(orderHash, async (data) => {
//     await this.handleOrderEvent(chainId, data);
//   });

//   this.logger.log(`[chain:${chainId}] Watching order ${orderHash}`);
//   }

  // ─── Unsubscribe ─────────────────────────────────────────────────────────────

  private unsubscribeOrder(orderHash: string) {
    // WebSocketApi doesn't have per-hash unsubscribe; 
    // removing from activeSubscriptions gates the handler
    this.activeSubscriptions.delete(orderHash);
    this.logger.log(` FUSION PLUS Unsubscribed from order ${orderHash}`);
  }

  // ─── Handle incoming order events ────────────────────────────────────────────

  private async handleOrderEvent(orderEvent: any) {
    const { orderHash, result, event } = orderEvent;

    // Only process orders we're tracking
    const sub = this.activeSubscriptions.get(result.orderHash);
    if (!sub) {
      this.logger.log(` fusion plus order not found ${orderHash}`)
      return;
    }
    switch (event) {
      case 'order_created':
        await this.swapOrderService.updateOrderStatus(orderHash, SwapOrderStatus.CREATED)
        break;
      case 'order_filled':
        await this.finalizeOrder(sub, SwapOrderStatus.COMPLETED);
        break;
      case 'order_partially_filled':
        this.logger.log(`fusion plus order partially filled ${orderHash}`)
        await this.swapOrderService.updateOrderStatus(orderHash, SwapOrderStatus.CREATED)
        break;
      case 'order_cancelled':
        await this.finalizeOrder(sub,  SwapOrderStatus.CANCELLED);
        break;
      case 'order_invalid':
        await this.finalizeOrder(sub, SwapOrderStatus.INVALID);
        break;
    }

  }

  // ─── Finalize: update DB + unsubscribe ───────────────────────────────────────

  private async finalizeOrder(
    sub: OrderSubscription,
    status: SwapOrderStatus,
  ) {
    const { orderHash } = sub;

    try {
      await this.swapOrderService.updateOrderStatus(orderHash, status)
      this.logger.log(` fusion plus Order ${orderHash} saved as ${status}`);
      this.unsubscribeOrder(orderHash);
    } catch (err) {
      this.logger.error(`Failed to update order ${orderHash}: ${err.message}`);
    } finally {
      // Always unsubscribe + clean up regardless of DB result
      this.unsubscribeOrder(orderHash);
    }
  }


  // ─── Debug / Monitoring ──────────────────────────────────────────────────────

  getActiveWatches() {
    return Array.from(this.activeSubscriptions.values());
  }
}