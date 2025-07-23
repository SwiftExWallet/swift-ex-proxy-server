import { Module } from '@nestjs/common';
import { FirebaseNotificationService } from './firebase/notification.service';

@Module({
  providers: [FirebaseNotificationService],
})
export class NotificationModule {}
