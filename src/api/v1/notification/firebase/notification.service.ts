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
      console.log('Firebase Admin SDK initialized successfully');
    }
  }

  async sendNotification(
    token: string,
    payload: NotificationDto,
  ): Promise<string> {
    try {
      const { title, body, data } = payload;
      const message: admin.messaging.Message = {
        token: token,
        notification: {
          title: title,
          body: body,
        },
        data: data,
        android: {
          priority: 'high',
          notification: {
            channelId: '1',
            sound: 'default',
            priority: 'high',
            defaultVibrateTimings: true,
            visibility: 'public',
          },
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
              badge: 0,
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
