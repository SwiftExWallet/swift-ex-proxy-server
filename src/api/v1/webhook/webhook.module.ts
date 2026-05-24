import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { AlchemyWebhookService } from './alchemyWebhook.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schema/order.schema';
import { OrdersModule } from '../orders/orders.module';
import { DeviceModule } from '../device/device.module';
import { RedisModule } from '../redis/redis.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    OrdersModule,
    DeviceModule,
    RedisModule,
    NotificationModule,
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    AlchemyWebhookService,
  ],
})
export class WebhookModule { }
