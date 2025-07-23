import { Injectable, Logger } from '@nestjs/common';
import { WebhookStellarDto } from './dto/webhook.steller.dto';
import { WebhookMoralisDto } from './dto/webhook.moralis.dto';
import { FirebaseNotificationService } from '../notification/firebase/notification.service';
import { NotificationDto } from '../notification/dto/notification.dto';
import { WebhookAssetType, WebhookNotificationType } from '../common/enums/webhook.enum';
import { formatEther } from 'ethers';
import * as crypto from 'crypto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly notificationService: FirebaseNotificationService) {}

  async handleStellar(payload: WebhookStellarDto) {
    if (payload.isTestPayload()) {
      return { status: 'ok', message: 'Test payload skipped' };
    }

    const tagSource = payload.tag ?? payload.data?.additionalData;
    if (!tagSource) return { status: false, message: 'No tag or additionalData found for decryption' };

    const decryptRes = await this.decryptToken(tagSource);
    if (!decryptRes.status) return { status: false, message: 'Token decryption failed' };

    const token = decryptRes.response;
    const body = `${payload.data.amount} ${payload.data.asset_type===WebhookAssetType.XLM?WebhookAssetType.LUMANS:payload.data.asset_code} has been received.`;

    const notificationPayload: NotificationDto = {
      title: `${WebhookNotificationType.STELLAR} Notification`,
      body,
      data: {},
    };
    
    const notificationStatus=await this.notificationService.sendNotification(token, notificationPayload);
    return { status: 'ok', message: notificationStatus };
  }

  async handleWebhookMoralis(payload: WebhookMoralisDto) {
    if (payload.isTestPayload()) {
      return { status: 'ok', message: 'Test payload skipped' };
    }
  
    const decryptRes = await this.decryptToken(payload.tag);
    if (!decryptRes.status) return { status: false, message: 'Token decryption failed' };
  
    const token = decryptRes.response;
  
    let body = 'A transaction has been received.';
  
    if (payload.erc20Transfers?.length > 0) {
      const erc = payload.erc20Transfers[0];
      const amount = erc.valueWithDecimals || formatEther(erc.value);
      body = `${amount} ${erc.tokenSymbol} has been received.`;
    } else if (payload.txs?.[0]?.value) {
      body = `${formatEther(payload.txs[0].value)} ETH has been received.`;
    }
  
    const notificationPayload: NotificationDto = {
      title: `${WebhookNotificationType.MULTICAHIN} Notification`,
      body,
      data: {},
    };
  
    const notificationEthStatus = await this.notificationService.sendNotification(token, notificationPayload);
    return { status: 'ok', message: notificationEthStatus };
  }

  private async decryptToken(tagBase64: string): Promise<{ status: boolean; response: string }> {
    try {
      const keyRes = await this.getSecretKey();
      if (!keyRes.status){
        return { status: keyRes.status, response: keyRes.response?.toString() }
      }

      const packed = Buffer.from(tagBase64, 'base64');
      const iv = packed.slice(0, 12);
      const authTag = packed.slice(-16);
      const ciphertext = packed.slice(12, -16);

      const decipher = crypto.createDecipheriv('aes-256-gcm', keyRes.response, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return { status: true, response: decrypted.toString('utf8') };
    } catch (err) {
      return { status: false, response: err.message };
    }
  }

  private async getSecretKey(): Promise<{ status: boolean; response: Buffer }> {
   try {
    const base64Key = process.env.TAG_SECRET_KEY;
    if (!base64Key) return { status: false, response: Buffer.from('') };

    const keyBuffer = Buffer.from(base64Key, 'base64');
    if (keyBuffer.length !== 32) return { status: false, response: Buffer.from('') };

    return { status: true, response: keyBuffer };
   } catch (error) {
    return { status: false, response: error };
   }
  }
}
