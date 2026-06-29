// fusion-watcher.service.ts
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import {
  NetworkEnum,
  WebSocketApi,
} from '@1inch/fusion-sdk';
import { SwapOrderStatus } from '../../common/enums/order.enum';
import { SwapOrderService } from '../../swapOrders/swapOrders.service';
import { RedisService } from '../../redis/redis.service';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';

export const FUSION_CHAINS: { chainId: NetworkEnum; name: string }[] = [
  { chainId: NetworkEnum.ETHEREUM,  name: 'ethereum'  },
  { chainId: NetworkEnum.POLYGON,   name: 'polygon'   },
  { chainId: NetworkEnum.ARBITRUM,  name: 'arbitrum'  },
  // { chainId: NetworkEnum.OPTIMISM,  name: 'optimism'  },
  // { chainId: NetworkEnum.BINANCE,   name: 'bnb'       },
  // { chainId: NetworkEnum.AVALANCHE, name: 'avalanche' },
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

  constructor(
    @Inject(forwardRef(() => SwapOrderService))
    private swapOrderService: SwapOrderService,
    private redisService: RedisService,
    private firebaseNotificationService:FirebaseNotificationService
  ) { }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async onModuleInit() {
    for (const chain of FUSION_CHAINS) {
      // this.initChainClient(chain.chainId, chain.name);
    }
  }

  async onModuleDestroy() {
    for (const [, client] of this.wsClients) {
      client.close();
    }
    this.wsClients.clear();
  }

  // ─── Init one WS client per chain ────────────────────────────────────────────

  private initChainClient(chainId: NetworkEnum, name: string) {
    const ws = new WebSocketApi({
      url: process.env.FUSION_WS_URL!,
      network: chainId,
      authKey: process.env.INCH_API_KEY!,
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

    // ws.init(); // connect now

    this.wsClients.set(chainId, ws);
  }
  // ─── Subscribe to a specific order ───────────────────────────────────────────

  async subscribeOrder(orderHash: string, chainId: NetworkEnum, quoteId: string) {
    const ws = this.wsClients.get(chainId);
    if (!ws) throw new Error(`No WS client for chainId ${chainId}`);

    const sub: OrderSubscription = { chainId, orderHash, quoteId };
    await this.redisService.setKey(`active_subscription:fusion:${orderHash}`, JSON.stringify(sub));

    this.logger.log(`[chain:${chainId}] Watching order ${orderHash}`);
  }

  // ─── Unsubscribe ─────────────────────────────────────────────────────────────

  private async unsubscribeOrder(orderHash: string, chainId: NetworkEnum) {
    await this.redisService.delKey(`active_subscription:fusion:${orderHash}`);
    this.logger.log(`[chain:${chainId}] Unsubscribed from order ${orderHash}`);
  }

  // ─── Handle incoming order events ────────────────────────────────────────────

  private async handleOrderEvent(chainId: NetworkEnum, orderEvent: any) {
    const { orderHash, result, event } = orderEvent;

    // Only process orders we're tracking
    const subData = await this.redisService.getKey(`active_subscription:fusion:${result.orderHash}`);
    if (!subData) {
      this.logger.log(`${chainId}:: order not found ${orderHash}`);
      return;
    }

    const sub = JSON.parse(subData) as OrderSubscription;
    if (sub.chainId !== chainId) {
      this.logger.log(`${chainId}:: order found but chainId mismatch ${orderHash}`);
      return;
    }

    switch (event) {
      case 'order_created':
        await this.swapOrderService.updateOrderStatus(orderHash, SwapOrderStatus.CREATED);
        break;
      case 'order_filled':
        await this.finalizeOrder(sub, SwapOrderStatus.COMPLETED);
        break;
      case 'order_partially_filled':
        this.logger.log(`${chainId}:: order partially filled ${orderHash}`);
        await this.swapOrderService.updateOrderStatus(orderHash, SwapOrderStatus.CREATED);
        break;
      case 'order_cancelled':
        await this.finalizeOrder(sub, SwapOrderStatus.CANCELLED);
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
    const { orderHash, chainId } = sub;

    try {
      const response=await this.swapOrderService.updateOrderByHash({txHash:orderHash, orderStatus:status});
      this.logger.log(`[chain:${chainId}] Order ${orderHash} saved as ${status}`);
      await this.unsubscribeOrder(orderHash, chainId);
      await this.firebaseNotificationService.sendNotification(
        response?.deviceFcmToken as string,
        {
          title: `Swap Tx Update`,
          body: `Order update ${response?.amountOut} amout has been marked as ${status}.`,
          data: {},
        },
      );
    } catch (err: any) {
      this.logger.error(`Failed to update order ${orderHash}: ${err.message}`);
    } finally {
      // Always unsubscribe + clean up regardless of DB result
      await this.unsubscribeOrder(orderHash, chainId);
    }
  }

  // ─── Debug / Monitoring ──────────────────────────────────────────────────────

  async getActiveWatches() {
    return [];
  }
}