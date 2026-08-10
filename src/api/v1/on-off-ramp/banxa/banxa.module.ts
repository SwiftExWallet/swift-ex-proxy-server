import { Module } from '@nestjs/common';
import { BanxaService } from './banxa.service';
import { BanxaController } from './banxa.controller';
import { BanxaWebhookService } from './banxaWebhook.service';
import { DeviceModule } from '../../device/device.module';
import { UserQueueService } from '../../common/user-queue/user-queue.service';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { HttpService } from '../../common/services/httpService';

@Module({
  imports: [DeviceModule],
  providers: [
    BanxaService,
    HttpService,
    UserQueueService,
    BanxaWebhookService,
    FirebaseNotificationService,
  ],
  controllers: [BanxaController],
})
export class BanxaModule {}
