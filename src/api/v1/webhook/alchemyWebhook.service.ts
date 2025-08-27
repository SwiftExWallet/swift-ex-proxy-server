import { Injectable, Logger } from '@nestjs/common';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { AlchemyOnRampWebhookDto } from './dto/alchemyOnRampWebhook.dto';
import {
  AlchemyOffRampStatus,
  AlchemyOffRampWebhookDto,
} from './dto/alchemyOffRampWebhook.dto';
import { Order } from '../orders/schema/order.schema';
import { NotificationDto } from '../notification/dto/notification.dto';
import { OrdersService } from '../orders/orders.service';
import { Device } from '../device/schema/device.schema';
import { DeviceService } from '../device/device.service';

@Injectable()
export class AlchemyWebhookService {
  private readonly logger = new Logger(AlchemyWebhookService.name);

  constructor(
    private readonly notificationService: FirebaseNotificationService,
    private readonly orderService: OrdersService,
    private readonly deviceService: DeviceService,
  ) {}

  async handleAlchemyOnRamp(dto: AlchemyOnRampWebhookDto): Promise<void> {
    try {
      const { status, amount } = dto;
      if (!status) {
        this.logger.log(`buy order not found status: ${status}`);
        return;
      }
      this.logger.log('Processing OnRamp webhook...');
      const { orderNo } = dto;
      const order: Order | null =
        await this.orderService.findOneByOrderNo(orderNo);
      if (!order) {
        this.logger.error(`order not found ${orderNo}`);
        return;
      }
      const body = `Order update: ₹${amount} payment has been marked as ${status}.`;
      if (!order.deviceId) {
        return;
      }
      const device: Device | null = await this.deviceService.findOne(
        order.deviceId,
      );
      const notificationPayload: NotificationDto = {
        title: `Buy Notification`,
        body,
        data: {},
      };
      await this.notificationService.sendNotification(
        device?.fcmToken as string,
        notificationPayload,
      );

      await this.orderService.update(
        order._id,
        Object.assign(order, { webhookResponse: dto, status: dto.status }),
      );
    } catch (error) {
      this.logger.error('Buy notification error:', error);
    }
  }

  async handleAlchemyOffRamp(dto: AlchemyOffRampWebhookDto): Promise<void> {
    try {
      console.log('Processing OffRamp webhook...');
      const { merchantOrderNo, status } = dto;
      if (!status) {
        this.logger.log(
          `Sell order not found status: ${AlchemyOffRampStatus[status as keyof AlchemyOffRampStatus]}`,
        );
        return;
      }
      const order: Order | null =
        await this.orderService.findOneByOrderNo(merchantOrderNo);
      if (!order) {
        this.logger.error(`order not found ${merchantOrderNo}`);
        return;
      }
      const body = `Order update: ₹${order.amount} payment has been marked as ${status}.`;

      const device: Device | null = await this.deviceService.findOne(
        order.deviceId,
      );
      const notificationPayload: NotificationDto = {
        title: `Sell Notification`,
        body,
        data: {},
      };
      await this.notificationService.sendNotification(
        device?.fcmToken as string,
        notificationPayload,
      );

      await this.orderService.update(
        order._id,
        Object.assign(order, { webhookResponse: dto, status: dto.status }),
      );
    } catch (error) {
      this.logger.error('Sell notification error:', error);
    }
  }
}
