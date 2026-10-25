import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Post,
} from '@nestjs/common';
import { RecoveryRegistrationService } from './recovery-registration.service';
import { RecoveryService } from './recovery.service';

interface SnsNotification {
  Type?: string;
  SubscribeURL?: string;
  Message?: string | Record<string, unknown>;
}

interface SesNotification {
  mail?: {
    source?: unknown;
  };
  content?: unknown;
}

@Controller('api/v1/recovery')
export class SesHookController {
  private readonly logger = new Logger(SesHookController.name);

  constructor(
    private readonly recovery: RecoveryService,
    private readonly registrations: RecoveryRegistrationService,
  ) {}

  @Post('ses-hook')
  async handle(@Body() body: unknown): Promise<{ statusCode: number }> {
    const sns = this.parseSnsBody(body);

    if (sns.Type === 'SubscriptionConfirmation') {
      if (!sns.SubscribeURL) {
        throw new BadRequestException(
          'SNS subscription confirmation URL is required',
        );
      }
      this.logger.log('SES hook received subscription confirmation');
      await fetch(sns.SubscribeURL);
      this.logger.log('SES SNS subscription confirmed');
      return { statusCode: 200 };
    }

    const ses = this.parseSesMessage(sns.Message);
    const sender = this.getSender(ses);
    const content = this.getContent(ses);
    this.logger.log(`SES hook received notification for sender ${sender}`);

    void this.processRecovery(sender, content).catch((error: unknown) => {
      this.logger.error(
        `SES recovery processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    return { statusCode: 200 };
  }

  private async processRecovery(
    sender: string,
    content: string,
  ): Promise<void> {
    this.logger.log(`SES recovery processing started for sender ${sender}`);
    const registration = await this.registrations.findByEmail(sender);
    if (!registration) {
      this.logger.warn(
        `SES recovery ignored for unregistered sender ${sender}`,
      );
      return;
    }

    await this.recovery.start(
      registration.walletAddress,
      Buffer.from(content, 'base64'),
    );
    this.logger.log(
      `SES recovery started for wallet ${registration.walletAddress}`,
    );
  }

  private parseSnsBody(body: unknown): SnsNotification {
    const parsed = this.parseJsonValue(body, 'SNS notification body');
    if (!this.isRecord(parsed)) {
      throw new BadRequestException('SNS notification body must be an object');
    }
    return parsed as SnsNotification;
  }

  private parseSesMessage(
    message: SnsNotification['Message'],
  ): SesNotification {
    if (message == null) {
      throw new BadRequestException('SNS notification Message is required');
    }

    const parsed = this.parseJsonValue(message, 'SES notification Message');
    if (!this.isRecord(parsed)) {
      throw new BadRequestException(
        'SES notification Message must be an object',
      );
    }
    return parsed as SesNotification;
  }

  private getSender(ses: SesNotification): string {
    if (typeof ses.mail?.source !== 'string') {
      throw new BadRequestException('SES notification source is required');
    }

    const sender = ses.mail.source.trim();
    if (!sender) {
      throw new BadRequestException('SES notification source is required');
    }
    return sender;
  }

  private getContent(ses: SesNotification): string {
    if (typeof ses.content !== 'string' || !ses.content.trim()) {
      throw new BadRequestException('SES notification content is required');
    }
    return ses.content;
  }

  private parseJsonValue(value: unknown, field: string): unknown {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      throw new BadRequestException(`${field} must be valid JSON`);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
