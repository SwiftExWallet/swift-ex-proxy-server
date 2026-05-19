// fusion-watcher.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  NetworkEnum,
  WebSocketApi,
  OrderStatus,
} from '@1inch/fusion-sdk';
import { SwapOrderService } from '../swapOrders/swapOrders.service';
import { SwapOrderStatus } from '../common/enums/order.enum';


export const FUSION_CHAINS: { chainId: NetworkEnum; name: string }[] = [
  { chainId: NetworkEnum.ETHEREUM,  name: 'ethereum'  },
  { chainId: NetworkEnum.POLYGON,   name: 'polygon'   },
  { chainId: NetworkEnum.ARBITRUM,  name: 'arbitrum'  },
  { chainId: NetworkEnum.OPTIMISM,  name: 'optimism'  },
  { chainId: NetworkEnum.BINANCE,   name: 'bnb'       },
  { chainId: NetworkEnum.AVALANCHE, name: 'avalanche' },
];

interface OrderSubscription {
  chainId: NetworkEnum;
  orderHash: string;
  quoteId: string;
}

@Injectable()
export class InchWsPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InchWsPollerService.name);

  // One persistent WS client per chain
  private wsClients = new Map<NetworkEnum, WebSocketApi>();

  // Track which orders we're watching: orderHash -> meta
  private activeSubscriptions = new Map<string, OrderSubscription>();

  constructor(
   private swapOrderService: SwapOrderService
  ) {}

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async onModuleInit() {
    for (const chain of FUSION_CHAINS) {
      this.initChainClient(chain.chainId, chain.name);
    }
  }

  async onModuleDestroy() {
    for (const [, client] of this.wsClients) {
      client.close();
    }
    this.wsClients.clear();
    this.activeSubscriptions.clear();
  }

  // ─── Init one WS client per chain ────────────────────────────────────────────

  private initChainClient(chainId: NetworkEnum, name: string) {
    const ws = new WebSocketApi({
      url: 'wss://api.1inch.dev/fusion/ws',
      network: chainId,
      authKey: process.env.ONEINCH_API_KEY!,
      lazyInit: true,   // don't auto-connect until we call init()
    });
    
    ws.onOpen(() => {
      this.logger.log(`[${name}] WS connected`);
    });

    ws.onClose(() => {
      this.logger.warn(`[${name}] WS closed — reconnecting in 5s`);
      setTimeout(() => this.initChainClient(chainId, name), 5000);
    });

    ws.onError((err) => {
      this.logger.error(`[${name}] WS error: ${String(err)}`);
    });

    // Central order event handler for this chain
    ws.order.onOrder(async (data) => {
      await this.handleOrderEvent(chainId, data);
    });

    ws.init(); // connect now

    this.wsClients.set(chainId, ws);
  }
  // ─── Subscribe to a specific order ───────────────────────────────────────────

  async subscribeOrder(orderHash: string, chainId: NetworkEnum, quoteId: string) {
    const ws = this.wsClients.get(chainId);
    if (!ws) throw new Error(`No WS client for chainId ${chainId}`);
    this.activeSubscriptions.set(orderHash, { chainId, orderHash, quoteId });

    //subscrive to particular order
    ws.send(
      JSON.stringify({
         action: 'subscribe',
         topic: 'order',
         filter: {
            orderHash
         }
      })
   );
    this.logger.log(`[chain:${chainId}] Watching order ${orderHash}`);
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

  private unsubscribeOrder(orderHash: string, chainId: NetworkEnum) {
    // WebSocketApi doesn't have per-hash unsubscribe; 
    // removing from activeSubscriptions gates the handler
    this.activeSubscriptions.delete(orderHash);
    this.logger.log(`[chain:${chainId}] Unsubscribed from order ${orderHash}`);
  }

  // ─── Handle incoming order events ────────────────────────────────────────────

  private async handleOrderEvent(chainId: NetworkEnum, event: any) {
    const { orderHash, status, data } = event;

    // Only process orders we're tracking
    const sub = this.activeSubscriptions.get(orderHash);
    if (!sub || sub.chainId !== chainId) return;

    this.logger.log(`[chain:${chainId}] Order ${orderHash} → ${status}`);

    const terminalStatuses = [
      OrderStatus.Filled,
      OrderStatus.PartiallyFilled,
      OrderStatus.Cancelled,
      OrderStatus.Expired,
    ];

    if (terminalStatuses.includes(status)) {
      await this.finalizeOrder(sub, status);
    }
  }

  // ─── Finalize: update DB + unsubscribe ───────────────────────────────────────

  private async finalizeOrder(
    sub: OrderSubscription,
    status: OrderStatus,
  ) {
    const { orderHash, chainId } = sub;

    try {
      await this.swapOrderService.updateOrderStatus(orderHash, this.mapEventToStatus(status))


      this.logger.log(`[chain:${chainId}] Order ${orderHash} saved as ${status}`);
    } catch (err) {
      this.logger.error(`Failed to update order ${orderHash}: ${err.message}`);
    } finally {
      // Always unsubscribe + clean up regardless of DB result
      this.unsubscribeOrder(orderHash, chainId);
    }
  }



  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private mapEventToStatus(event: OrderStatus): SwapOrderStatus {
    const map: Record<OrderStatus, SwapOrderStatus> = {
      [OrderStatus.Filled]:           SwapOrderStatus.COMPLETED,
      [OrderStatus.PartiallyFilled]: SwapOrderStatus.PARTIALLY_FILLED,
      [OrderStatus.Cancelled]:        SwapOrderStatus.FAILED,
      [OrderStatus.Expired]:          SwapOrderStatus.FAILED,
      [OrderStatus.Pending]:          SwapOrderStatus.PENDING,
      [OrderStatus.FalsePredicate]:   SwapOrderStatus.FAILED,
      [OrderStatus.NotEnoughBalanceOrAllowance]: SwapOrderStatus.FAILED,
      [OrderStatus.WrongPermit]:      SwapOrderStatus.FAILED,
      [OrderStatus.InvalidSignature]: SwapOrderStatus.FAILED,
    };
    return map[event] ?? SwapOrderStatus.FAILED;
  }

  // ─── Debug / Monitoring ──────────────────────────────────────────────────────

  getActiveWatches() {
    return Array.from(this.activeSubscriptions.values());
  }
}