import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SwapOrderRepository } from '../swapOrders/swapOrder.repository';
import { OrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { NotificationDto } from '../notification/dto/notification.dto';
import { SwapOrders } from '../swapOrders/schema/swapOrder.schema';

interface WsConnection {
  ws: WebSocket | null;
  isConnected: boolean;
  reconnectInterval: NodeJS.Timeout | null;
  pendingOrders: Map<string, SwapOrders>;
  url: string;
}

@Injectable()
export class InchWsPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InchWsPollerService.name);
  private connections = new Map<string, WsConnection>();

  constructor(
    private readonly repo: SwapOrderRepository,
    private readonly firebaseNotificationService: FirebaseNotificationService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing 1inch WebSocket Poller...');
    await this.loadPendingOrders();
  }

  onModuleDestroy() {
    this.logger.log('Destroying 1inch WebSocket Poller...');
    for (const [key] of this.connections.entries()) {
      this.disconnect(key);
    }
  }

  private getConnectionKey(order: SwapOrders): string {
    if (order.provider === swapProvider.ONEINCH_FUSION) {
      return 'FUSION';
    } else if (order.provider === swapProvider.ONEINCH_FUSION_PLUS) {
      return 'FUSION_PLUS';
    }
    return 'UNKNOWN';
  }

  private getUrlForKey(key: string): string {
    const apiKey = process.env.INCH_API_KEY || '';
    if (key === 'FUSION') {
      return `wss://api.1inch.dev/fusion/ws?apiKey=${apiKey}`;
    } else if (key === 'FUSION_PLUS') {
      return `wss://api.1inch.com/fusion-plus/ws?apiKey=${apiKey}`;
    }
    return '';
  }

  private ensureConnection(key: string) {
    if (!this.connections.has(key)) {
      this.connections.set(key, {
        ws: null,
        isConnected: false,
        reconnectInterval: null,
        pendingOrders: new Map(),
        url: this.getUrlForKey(key),
      });
      this.connect(key);
    }
  }

  addOrderToTracking(order: SwapOrders) {
    const key = this.getConnectionKey(order);
    if (key === 'UNKNOWN') return;

    this.ensureConnection(key);
    const conn = this.connections.get(key)!;

    if (!conn.pendingOrders.has(order.txHash)) {
      conn.pendingOrders.set(order.txHash, order);
      this.subscribeToOrder(key, order.txHash);
    }
  }

  private async loadPendingOrders() {
    try {
      const [result1, result2] = await Promise.all([
        this.repo.findPendingByProvider(swapProvider.ONEINCH_FUSION),
        this.repo.findPendingByProvider(swapProvider.ONEINCH_FUSION_PLUS)
      ]);

      const pending: SwapOrders[] = [];
      if (result1.ok) pending.push(...result1.data);
      else this.logger.error(`fetch failed for ONEINCH_FUSION: ${result1.error}`);

      if (result2.ok) pending.push(...result2.data);
      else this.logger.error(`fetch failed for ONEINCH_FUSION_PLUS: ${result2.error}`);

      for (const order of pending) {
        this.addOrderToTracking(order);
      }
    } catch (err) {
      this.logger.error('Error loading pending orders', err);
    }
  }

  private connect(key: string) {
    const conn = this.connections.get(key);
    if (!conn || conn.ws || conn.isConnected) return;

    conn.ws = new WebSocket(conn.url, ['graphql-ws']);

    conn.ws.onopen = () => {
      conn.isConnected = true;
      this.logger.log(`Connected to 1inch WebSocket for ${key}`);
      if (conn.reconnectInterval) {
        clearInterval(conn.reconnectInterval);
        conn.reconnectInterval = null;
      }

      // Re-subscribe to all known pending orders
      for (const orderHash of conn.pendingOrders.keys()) {
        this.subscribeToOrder(key, orderHash);
      }
    };

    conn.ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        await this.handleMessage(key, data);
      } catch (err) {
        this.logger.error(`Error parsing WS message for ${key}`, err);
      }
    };

    conn.ws.onerror = (error) => {
      this.logger.error(`1inch WebSocket Error for ${key}:`, error);
    };

    conn.ws.onclose = () => {
      conn.isConnected = false;
      this.logger.warn(`1inch WebSocket connection closed for ${key}. Reconnecting in 5 seconds...`);
      conn.ws = null;
      this.scheduleReconnect(key);
    };
  }

  private disconnect(key: string) {
    const conn = this.connections.get(key);
    if (!conn) return;

    if (conn.reconnectInterval) {
      clearInterval(conn.reconnectInterval);
    }
    if (conn.ws) {
      conn.ws.close();
      conn.ws = null;
    }
    conn.isConnected = false;
  }

  private scheduleReconnect(key: string) {
    const conn = this.connections.get(key);
    if (!conn) return;

    if (!conn.reconnectInterval) {
      conn.reconnectInterval = setInterval(() => {
        this.connect(key);
      }, 5000);
    }
  }

  private subscribeToOrder(key: string, orderHash: string) {
    const conn = this.connections.get(key);
    if (conn && conn.ws && conn.isConnected) {
      const payload = {
        type: 'subscribe',
        channel: 'order_status',
        orderHash: orderHash,
      };

      conn.ws.send(JSON.stringify(payload));
      this.logger.debug(`Subscribed to 1inch WS for order ${orderHash} on ${key}`);
    }
  }

  private async handleMessage(key: string, data: any) {
    const conn = this.connections.get(key);
    if (!conn) return;

    const orderHash = data?.orderHash || data?.message?.orderHash;
    const rawStatus = data?.status || data?.message?.status;

    if (!orderHash || !rawStatus) {
      return;
    }

    const order = conn.pendingOrders.get(orderHash);
    if (!order) return;

    let newStatus: OrderStatus | null = null;
    
    if (rawStatus === 'filled' || rawStatus === 'completed') {
      newStatus = OrderStatus.COMPLETED;
    } else if (rawStatus === 'cancelled' || rawStatus === 'failed' || rawStatus === 'expired') {
      newStatus = OrderStatus.FAILED;
    }

    if (newStatus) {
      this.logger.log(`1inch order ${orderHash} status updated to ${newStatus}`);
      const dbResult = await this.repo.updateStatus(orderHash, newStatus, null);

      if (dbResult.ok) {
        conn.pendingOrders.delete(orderHash);
        
        if (newStatus === OrderStatus.COMPLETED) {
          await this.processTxNotification(order);
        }
      } else {
        this.logger.error(`Failed to update DB for order ${orderHash}: ${dbResult.error}`);
      }
    }
  }

  private async processTxNotification(tx: SwapOrders): Promise<void> {
    const notificationPayload: NotificationDto = {
        title: `1inch Swap Update`,
        body: `Swap order for ${tx.amountOut} has been marked as ${OrderStatus.COMPLETED}.`,
        data: {},
    };
    await this.firebaseNotificationService.sendNotification(
        tx.deviceFcmToken as string,
        notificationPayload,
    );
  }
}
