import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';


@Module({
  controllers: [WebhookController],
  providers: [WebhookService,FirebaseNotificationService],
})
export class WebhookModule {}
