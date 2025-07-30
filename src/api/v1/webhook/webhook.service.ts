import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { WebhookStellarDto } from './dto/stellarWebhook.dto';
import { WebhookMoralisDto } from './dto/moralisWebhook.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { NotificationDto } from '../notification/dto/notification.dto';
import {
  WebhookAssetType,
  WebhookNotificationType,
} from '../common/enums/webhook.enum';
import { formatEther } from 'ethers';
import * as crypto from 'crypto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly notificationService: FirebaseNotificationService,
  ) {}

  async handleStellar(payload: WebhookStellarDto) {
    try {
      this.logger.log('==== WebhookReceived: HandleStellar');
      if (payload.isTestPayload()) {
        return { status: 'ok', message: 'Test payload skipped' };
      }

      const tagSource = payload.tag ?? payload.data?.additionalData;
      if (!tagSource) {
        this.logger.error('No tag or additionalData found for decryption');
        return;
      }

      const { decryptedToken } = this.decryptToken(tagSource);

      const body = `${payload.data.amount} ${payload.data.asset_type === WebhookAssetType.XLM ? WebhookAssetType.LUMENS : payload.data.asset_code} has been received.`;

      const notificationPayload: NotificationDto = {
        title: `${WebhookNotificationType.STELLAR} Notification`,
        body,
        data: {},
      };

      const notificationStatus =
        await this.notificationService.sendNotification(
          decryptedToken,
          notificationPayload,
        );
      this.logger.log(
        `==== Notification send successfully ===, ${notificationStatus}`,
      );
      return { status: 'ok', message: notificationStatus };
    } catch (error) {
      this.logger.error(
        `=== Error in sending notification ===, ${error.message}`,
      );
      this.logger.error(error);
    }
  }

  async handleWebhookMoralis(payload: WebhookMoralisDto) {
    try {
      this.logger.log('==== WebhookReceived: handleWebhookMoralis');

      if (payload.isTestPayload()) {
        return { status: 'ok', message: 'Test payload skipped' };
      }

      const { decryptedToken } = this.decryptToken(payload.tag);
      let body = 'A transaction has been received.';

      if (payload.erc20Transfers?.length > 0) {
        const erc = payload.erc20Transfers[0];
        const amount = erc.valueWithDecimals || formatEther(erc.value);
        body = `${amount} ${erc.tokenSymbol} has been received.`;
      } else if (payload.txs?.[0]?.value) {
        body = `${formatEther(payload.txs[0].value)} ETH has been received.`;
      }

      const notificationPayload: NotificationDto = {
        title: `${WebhookNotificationType.MULTI_CHAIN} Notification`,
        body,
        data: {},
      };

      const notificationEthStatus =
        await this.notificationService.sendNotification(
          decryptedToken,
          notificationPayload,
        );
      return { status: 'ok', message: notificationEthStatus };
    } catch (error: any) {
      this.logger.error(
        `=== Error in sending notification ===, ${error.message}`,
      );
      this.logger.error(error);
    }
  }

  private decryptToken(tagBase64: string): {
    decryptedToken: string;
  } {
    const { secretKey } = this.getSecretKey();
    const packed = Buffer.from(tagBase64, 'base64');
    const iv = packed.subarray(0, 12);
    const authTag = packed.subarray(-16);
    const cipherText = packed.subarray(12, -16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(cipherText),
      decipher.final(),
    ]);
    return { decryptedToken: decrypted.toString('utf8') };
  }

  private getSecretKey(): { status: boolean; secretKey: Buffer } {
    const base64Key = process.env.TAG_SECRET_KEY;
    if (!base64Key) {
      this.logger.error(`=== TAG_SECRET_KEY not found ====`);
      throw new NotFoundException('==== TAG_SECRET_KEY Not found ===');
    }

    const keyBuffer = Buffer.from(base64Key, 'base64');
    if (keyBuffer.length !== 32) {
      this.logger.error(`=== Invalid or missing TAG_SECRET_KEY ====`);
      throw new InternalServerErrorException(
        'TAG_SECRET_KEY is invalid or not configured properly.',
      );
    }
    return { status: true, secretKey: keyBuffer };
  }
}
