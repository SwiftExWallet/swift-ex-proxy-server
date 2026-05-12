import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SwapOrderRepository } from '../swapOrders/swapOrder.repository';
import { OrderStatus } from '../common/enums/order.enum';
import { swapProvider } from '../common/enums/chain.enum';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { NotificationDto } from '../notification/dto/notification.dto';
import { SwapOrders } from '../swapOrders/schema/swapOrder.schema';

@Injectable()
export class InchWsPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InchWsPollerService.name);
  private ws: WebSocket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private pendingOrders: Map<string, SwapOrders> = new Map();

  constructor(
    private readonly repo: SwapOrderRepository,
    private readonly firebaseNotificationService: FirebaseNotificationService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing 1inch WebSocket Poller...');
    await this.loadPendingOrders();
    this.connect();

    // Periodically reloading is disabled as orders are now subscribed on creation
    // setInterval(() => this.loadPendingOrders(), 60000); // every minute
  }

  onModuleDestroy() {
    this.logger.log('Destroying 1inch WebSocket Poller...');
    this.disconnect();
  }

  addOrderToTracking(order: SwapOrders) {
    if (!this.pendingOrders.has(order.txHash)) {
      this.pendingOrders.set(order.txHash, order);
      this.subscribeToOrder(order.txHash);
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
        if (!this.pendingOrders.has(order.txHash)) {
          this.pendingOrders.set(order.txHash, order);
          this.subscribeToOrder(order.txHash);
        }
      }
    } catch (err) {
      this.logger.error('Error loading pending orders', err);
    }
  }

  private connect() {
    if (this.ws || this.isConnected) return;

    // Use process.env.INCH_API_KEY for authorization if needed
    const wsUrl = `wss://api.1inch.dev/fusion/ws`; 
    // Wait: auth might be required in URL or header. For native WebSocket, we might need protocols or we can try passing it in the URL if supported.
    
    this.ws = new WebSocket(wsUrl, ['graphql-ws']); // using graphql-ws protocol as a placeholder, might need adjustment based on exact 1inch WS format

    this.ws.onopen = () => {
      this.isConnected = true;
      this.logger.log('Connected to 1inch WebSocket');
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }

      // Re-subscribe to all known pending orders
      for (const orderHash of this.pendingOrders.keys()) {
        this.subscribeToOrder(orderHash);
      }
    };

    this.ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        await this.handleMessage(data);
      } catch (err) {
        this.logger.error('Error parsing WS message', err);
      }
    };

    this.ws.onerror = (error) => {
      this.logger.error('1inch WebSocket Error:', error);
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.logger.warn('1inch WebSocket connection closed. Reconnecting in 5 seconds...');
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private disconnect() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private scheduleReconnect() {
    if (!this.reconnectInterval) {
      this.reconnectInterval = setInterval(() => {
        this.connect();
      }, 5000);
    }
  }

  private subscribeToOrder(orderHash: string) {
    if (this.ws && this.isConnected) {
      // Assuming a generic subscription payload. This may need to be adjusted
      // depending on 1inch's specific WS API documentation.
      const payload = {
        type: 'subscribe',
        channel: 'order_status',
        orderHash: orderHash,
      };
      
      // If auth token is needed inside the payload:
      // payload['auth'] = process.env.INCH_API_KEY;

      this.ws.send(JSON.stringify(payload));
      this.logger.debug(`Subscribed to 1inch WS for order ${orderHash}`);
    }
  }

  private async handleMessage(data: any) {
    // Determine status from data
    // Assuming data has { orderHash: "...", status: "filled" | "cancelled" ... }
    const orderHash = data?.orderHash || data?.message?.orderHash;
    const rawStatus = data?.status || data?.message?.status;

    if (!orderHash || !rawStatus) {
      return;
    }

    const order = this.pendingOrders.get(orderHash);
    if (!order) return;

    let newStatus: OrderStatus | null = null;
    
    // Map 1inch status to internal OrderStatus
    if (rawStatus === 'filled' || rawStatus === 'completed') {
      newStatus = OrderStatus.COMPLETED;
    } else if (rawStatus === 'cancelled' || rawStatus === 'failed' || rawStatus === 'expired') {
      newStatus = OrderStatus.FAILED;
    }

    if (newStatus) {
      this.logger.log(`1inch order ${orderHash} status updated to ${newStatus}`);
      const dbResult = await this.repo.updateStatus(orderHash, newStatus, null);

      if (dbResult.ok) {
        this.pendingOrders.delete(orderHash);
        
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
