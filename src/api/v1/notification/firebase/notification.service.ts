import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { NotificationDto } from '../dto/notification.dto';
import * as firebaseAccount from './firebaseServiceAccount.json';
@Injectable()
export class FirebaseNotificationService {
  onModuleInit() {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          firebaseAccount as admin.ServiceAccount,
        ),
      });
    }
  }

  async sendNotification(
    token: string,
    payload: NotificationDto,
  ): Promise<string> {
    try {
      const { title, body, data } = payload;
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: title,
          body: body,
        },
        data: data || {},
        // Android specific configuration for heads-up notifications
        android: {
          priority: 'high',
          notification: {
            priority: 'max',
            defaultSound: true,
            defaultVibrateTimings: true,
            sticky: false,
            localOnly: false,
            defaultLightSettings: true,
            visibility: 'public',
            channelId: '1',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
          ttl: 3600 * 1000, // 1 hour TTL
        },
        // iOS specific configuration
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
              badge: 1,
            },
          },
        },
      };
      const response = await admin.messaging().send(message);
      return response;
    } catch (error) {
      console.error('Error sending FCM notification:', error);
      throw new Error('Failed to send notification');
    }
  }
}
