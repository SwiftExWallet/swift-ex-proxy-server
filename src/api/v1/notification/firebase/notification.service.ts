import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { NotificationDto } from '../dto/notification.dto';
import * as firebaseAccount from './firebaseServiceAccount.json';

@Injectable()
export class FirebaseNotificationService {
  private readonly logger = new Logger(FirebaseNotificationService.name);

  onModuleInit() {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          firebaseAccount as admin.ServiceAccount,
        ),
      });
      console.log('Firebase Admin SDK initialized successfully');
    }
  }

  async sendNotification(
    token: string,
    payload: NotificationDto,
  ): Promise<string | null> {
    try {
      const { title, body, data } = payload;
      const message: any = {
        token,
        notification: {
          title: title,
          body: body,
        },
        data: data || {},
        android: {
          priority: 'high' as any,
          notification: {
            priority: 'max' as any,
            defaultSound: true as any,
            visibility: 'public' as any,
            channelId: '1' as any,
            notificationPriority: 'PRIORITY_MAX' as any,
          },
          ttl: 3600 * 1000,
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
          },
          payload: {
            aps: {
              alert: {
                title: title,
                body: body,
              },
              sound: 'default',
            },
          },
        },
      };
      const response = await admin.messaging().send(message);
      return response;
    } catch (error) {
      this.logger.error('Error sending FCM notification', error);
      return null;
    }
  }
}
