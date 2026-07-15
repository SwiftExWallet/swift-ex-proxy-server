import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebhookMoralisDto } from './dto/moralisWebhook.dto';
import { WebhookService } from './webhook.service';
import { AlchemyOnRampWebhookDto } from './dto/alchemyOnRampWebhook.dto';
import { AlchemyOffRampWebhookDto } from './dto/alchemyOffRampWebhook.dto';
import { AlchemyWebhookService } from './alchemyWebhook.service';
import { WebhookStellarDto } from './dto/stellarWebhook.dto';
import { BanxaWebhookService } from './banxaWebhook.service';
import { BanxaWebhookDto } from './dto/banxaWebhook.dto';

@Controller('/api/v1/webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly alchemyWebhookService: AlchemyWebhookService,
    private readonly banxaWebhookService: BanxaWebhookService,
  ) {}

  @Post('stellar-transactions')
  @HttpCode(HttpStatus.OK)
  async handleWebhookStellar(@Body() webhookStellarDto: WebhookStellarDto) {
    await this.webhookService.handleStellar(webhookStellarDto);
    return { status: 'ok', message: 'stellar webhook received.' };
  }

  @Post('moralis-transactions')
  @HttpCode(HttpStatus.OK)
  async handleWebhookMoralis(@Body() payload: WebhookMoralisDto) {
    await this.webhookService.handleWebhookMoralis(payload);
    return { status: 'ok', message: 'moralis webhook received.' };
  }

  @Post('alchemy-on-ramp')
  async handleOnRamp(@Body() body: AlchemyOnRampWebhookDto) {
    await this.alchemyWebhookService.handleAlchemyOnRamp(body);
    return { status: 'ok', message: 'alchemy on ramp webhook received.' };
  }

  @Post('alchemy-off-ramp')
  async handleOffRamp(@Body() body: AlchemyOffRampWebhookDto) {
    await this.alchemyWebhookService.handleAlchemyOffRamp(body);
    return { status: 'ok', message: 'alchemy off ramp webhook received.' };
  }

  @Post('banxa')
  @HttpCode(200)
  async handleBanxaRamp(@Body() body: BanxaWebhookDto) {
    await this.banxaWebhookService.handleWebHook(body);
    return { status: 'ok', message: 'banxa webhook received.' };
  }
}
