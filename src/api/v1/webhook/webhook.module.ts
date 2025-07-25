import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { AlchemyWebhookService } from './alchemy.webhook.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UserOrder, UserOrdersSchema } from '../users/schema/userOrders.schema';


@Module({
  imports: [
      MongooseModule.forFeature([{ name: UserOrder.name, schema: UserOrdersSchema }]),
    ],
  controllers: [WebhookController],
  providers: [WebhookService,FirebaseNotificationService,AlchemyWebhookService],
})
export class WebhookModule {}
