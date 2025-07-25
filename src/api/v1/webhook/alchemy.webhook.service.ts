import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { AlchemyOnRampWebhookDto } from './dto/webhook.alchemyOnramp.dto';
import { AlchemyOffRampStatus, AlchemyOffRampWebhookDto } from './dto/webhook.alchemyOfframp.dto';
import { InjectModel } from '@nestjs/mongoose';
import { UserOrder } from '../users/schema/userOrders.schema';
import { Model } from 'mongoose';
import { NotificationDto } from '../notification/dto/notification.dto';

@Injectable()
export class AlchemyWebhookService {
  private readonly logger = new Logger(AlchemyWebhookService.name);

  constructor(
    @InjectModel(UserOrder.name) private userOrderModel: Model<UserOrder>,
    private readonly notificationService: FirebaseNotificationService) { }

  async handleAlchmeyOnRamp(dto: AlchemyOnRampWebhookDto): Promise<void> {
    try {
      console.log('Processing OnRamp webhook...');
      const matched = await this.findByOrderId(dto.orderNo,dto);
      if (matched.status) {
        const body = `Order update: ₹${dto.amount} payment has been marked as ${dto.status}.`;
        const notificationPayload: NotificationDto = { title: `Buy Notification`, body, data: {}, };
        await this.notificationService.sendNotification(matched.response.deviceFCM, notificationPayload);
      }
      this.logger.log(`buy order not found status: ${matched.status}`);
    } catch (error) {
      this.logger.error("Buy notification error:", error)
    }
  }

  async handleAlchmeyOffRamp(dto: AlchemyOffRampWebhookDto): Promise<void> {
    try {
      console.log('Processing OffRamp webhook...');
      const matched = await this.findByMerchantOrderNo(dto.merchantOrderNo,dto);
      if (matched.status) {
        const body = `Order update: ₹${matched.response.requsetdPayload.amount} payment has been marked as ${dto.status}.`;
        const notificationPayload: NotificationDto = { title: `Sell Notification`, body, data: {}, };
        await this.notificationService.sendNotification(matched.response.deviceFCM, notificationPayload);
      }
      this.logger.log(`sell order not found status: ${matched.status}`);
    } catch (error) {
      this.logger.error("Sell notification error:", error)
    }
  }


  private async findByOrderId(orderId: string,webhookRepo:any): Promise<{ response: any; status: boolean }> {
    const orderRes = await this.userOrderModel.findOne({ orderId });
    if (!orderRes) {
      return { response: 'Order not found', status: false }
    }
    orderRes.webhookResponse=webhookRepo;
    orderRes.status=webhookRepo?.status;
    await orderRes.save();
    return { response: orderRes, status: true };
  }

  private async findByMerchantOrderNo(orderId: string,webhookRepo:any): Promise<{ response: any; status: boolean }> {
    const orderRes = await this.userOrderModel.findOne({ orderId });
    if (!orderRes) {
      return { response: 'Order not found', status: false }
    }
    const resStatus=this.findOffRampStatus(webhookRepo?.status)
    orderRes.webhookResponse=webhookRepo;
    orderRes.status=resStatus;
    await orderRes.save();
    return { response: orderRes, status: true };
  }

  private findOffRampStatus(code: string): keyof typeof AlchemyOffRampStatus | 'UNKNOWN' {
    const entry = Object.entries(AlchemyOffRampStatus).find(([_, value]) => value === code);
    return entry ? (entry[0] as keyof typeof AlchemyOffRampStatus) : 'UNKNOWN';
  }
  
  
}
