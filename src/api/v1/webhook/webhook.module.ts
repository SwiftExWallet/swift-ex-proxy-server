import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { AlchemyWebhookService } from './alchemyWebhook.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schema/order.schema';
import { OrdersModule } from '../orders/orders.module';
import { DeviceModule } from '../device/device.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    OrdersModule,
    DeviceModule,
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    FirebaseNotificationService,
    AlchemyWebhookService,
  ],
})
export class WebhookModule {}
