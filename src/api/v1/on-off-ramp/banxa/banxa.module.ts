import { Module } from '@nestjs/common';
import { BanxaService } from './banxa.service';
import { BanxaWebhookService } from './banxaWebhook.service';
import { DeviceModule } from '../../device/device.module';
import { FirebaseNotificationService } from '../../notification/firebase/notification.service';
import { HttpService } from '../../common/services/httpService';

@Module({
  imports: [DeviceModule],
  providers: [
    BanxaService,
    HttpService,
    BanxaWebhookService,
    FirebaseNotificationService,
  ],
  exports: [BanxaService],
})
export class BanxaModule {}
