import { Controller, Post, Body, Logger, HttpCode, HttpStatus, InternalServerErrorException, } from '@nestjs/common';
import { WebhookEnum } from '../common/enums/webhook.enum';
import { WebhookStellarDto } from './dto/webhook.steller.dto';
import { WebhookMoralisDto } from './dto/webhook.moralis.dto';
import { WebhookService } from './webhook.service';
import { AlchemyOnRampWebhookDto } from './dto/webhook.alchemyOnramp.dto';
import { AlchemyOffRampWebhookDto } from './dto/webhook.alchemyOfframp.dto';
import { AlchemyWebhookService } from './alchemy.webhook.service';

@Controller('/api/v1/webhook')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        private readonly webhookService: WebhookService,
        private readonly alchemyWebhookService: AlchemyWebhookService
    ) { }

    @Post('steller-transactions')
    @HttpCode(HttpStatus.OK)
    async handleWebhookStellar(@Body() payload: WebhookStellarDto) {
        const isTest = payload.eventType === WebhookEnum.TEST;

        if (isTest) {
            this.logger.warn('Stellar webhook test payload detected.');
            return { status: 'ok', message: 'Test payload.' };
        }

        try {
            this.logger.log('Stellar webhook processing...');
            return await this.webhookService.handleStellar(payload);
        } catch (error) {
            this.logger.error('Stellar webhook processing payload error:', error.stack);
            throw new InternalServerErrorException('Failed to process stellar webhook.');
        }
    }

    @Post('moralis-transactions')
    @HttpCode(HttpStatus.OK)
    async handleWebhookMoralis(@Body() payload: WebhookMoralisDto) {
        if (payload.isTestPayload()) {
            this.logger.warn('Moralis webhook test payload detected.');
            return { status: 'ok', message: 'Test payload.' };
        }

        try {
            this.logger.log('Moralis webhook processing...');
            return await this.webhookService.handleWebhookMoralis(payload);
        } catch (error) {
            this.logger.error('Moralis webhook processing payload error:', error.stack);
            throw new InternalServerErrorException('Failed to process moralis webhook.');
        }
    }

    @Post('alchemy-onramp')
    async handleOnRamp(@Body() body: AlchemyOnRampWebhookDto) {
        await this.alchemyWebhookService.handleAlchmeyOnRamp(body);
        return { status: 'ok', message: 'webhook received.' };
    }

    @Post('alchemy-offramp')
    async handleOffRamp(@Body() body: AlchemyOffRampWebhookDto) {
        await this.alchemyWebhookService.handleAlchmeyOffRamp(body);
        return { status: 'ok', message: 'webhook received.' };
    }
}
