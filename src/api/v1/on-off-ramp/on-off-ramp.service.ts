import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AlchemyService } from './alchemy/alchemy.service';
import { CreateBuyOrderDto } from './alchemy/dto/alchemy-create-order.dto';
import { AlchemyQuotesDto } from './alchemy/dto/alchemy-quotes-order.dto';
import { SellOrderDto } from './alchemy/dto/alchemy-sell-order.dto';
import { BanxaService } from './banxa/banxa.service';
import { CreateOrderDto } from './banxa/dto/banxa-create-order.dto';
import { AssetsDto, BanxaQuotesDto } from './banxa/dto/banxa-quotes.dto';
import {
  OnOffRampAssetsQueryDto,
  OnOffRampLinkPayloadDto,
  OnOffRampOrderPayloadDto,
  OnOffRampQuotePayloadDto,
} from './dto/on-off-ramp.dto';
import { LinkDto, Side } from './moonpay/dto/moonpay.dto';
import { MoonPayService } from './moonpay/moonpay.service';
import { OnOffRampProvider } from './on-off-ramp-provider.enum';
import { UserQueueService } from '../common/user-queue/user-queue.service';

type NormalizedRampProvider =
  | OnOffRampProvider.ALCHEMY
  | OnOffRampProvider.BANXA
  | OnOffRampProvider.MOONPAY;
type RequestPayload = Record<string, unknown>;

@Injectable()
export class OnOffRampService {
  constructor(
    private readonly alchemyService: AlchemyService,
    private readonly banxaService: BanxaService,
    private readonly moonPayService: MoonPayService,
    private readonly userQueueService: UserQueueService,
  ) {}

  async getQuote(payload: OnOffRampQuotePayloadDto) {
    const side = this.normalizeSide(payload.side);

    switch (this.normalizeProvider(payload.provider)) {
      case OnOffRampProvider.ALCHEMY:
        return this.userQueueService.processUserRequest(async () => {
          const quote = await this.alchemyService.fetchQuotes(
            this.validateDto(AlchemyQuotesDto, {
              crypto: payload.crypto,
              network: payload.network,
              fiat: payload.fiat,
              amount: payload.amount,
              side: side.toUpperCase(),
            }),
          );
          return { success: quote.status, data: quote.data };
        });
      case OnOffRampProvider.BANXA:
        return this.userQueueService.processUserRequest(async () => {
          const quote = await this.banxaService.fetchQuotes(
            this.validateDto(BanxaQuotesDto, {
              paymentMethodId: payload.paymentMethodId,
              crypto: payload.crypto,
              blockchain: payload.blockchain ?? payload.network,
              fiat: payload.fiat,
              cryptoAmount: payload.cryptoAmount,
              fiatAmount: payload.fiatAmount,
              orderType: side,
            }),
          );
          return { success: quote.status, data: quote.data };
        });
      case OnOffRampProvider.MOONPAY:
        return this.moonPayService.getQuote(
          side,
          this.requiredString(payload.code ?? payload.crypto, 'code'),
          this.requiredNumber(payload.amount, 'amount'),
          this.optionalString(payload.fiat) ?? 'usd',
        );
    }
  }

  async createOrder(payload: OnOffRampOrderPayloadDto, device: any) {
    const { provider, side: rawSide, ...orderPayload } = payload;
    const side = this.normalizeSide(rawSide);

    switch (this.normalizeProvider(provider)) {
      case OnOffRampProvider.ALCHEMY:
        if (side === 'buy') {
          return {
            success: this.alchemyService.orderCreate(
              this.validateDto(CreateBuyOrderDto, orderPayload),
            ),
          };
        }

        return {
          success: this.alchemyService.sellOrderCreate(
            this.validateDto(SellOrderDto, orderPayload),
          ),
        };
      case OnOffRampProvider.BANXA:
        if (side === 'buy') {
          return {
            success: await this.banxaService.buyOrderCreate(
              this.validateDto(CreateOrderDto, orderPayload),
              device,
            ),
          };
        }

        return {
          success: await this.banxaService.sellOrderCreate(
            this.validateDto(CreateOrderDto, orderPayload),
            device,
          ),
        };
      case OnOffRampProvider.MOONPAY:
        throw new BadRequestException('MoonPay orders use /link');
    }
  }

  async getAssets(query: OnOffRampAssetsQueryDto) {
    const side = this.normalizeSide(query.side ?? query.orderType, 'buy');

    switch (this.normalizeProvider(query.provider)) {
      case OnOffRampProvider.BANXA:
        return this.banxaService.fetchAssets(
          this.validateDto(AssetsDto, { orderType: side }),
        );
      case OnOffRampProvider.MOONPAY:
        return this.moonPayService.getCurrencies(side);
      case OnOffRampProvider.ALCHEMY:
        throw new BadRequestException('Alchemy assets are not supported');
    }
  }

  async buildLink(payload: OnOffRampLinkPayloadDto, device: any) {
    if (
      this.normalizeProvider(payload.provider) !== OnOffRampProvider.MOONPAY
    ) {
      throw new BadRequestException('Link is only supported for MoonPay');
    }

    return this.moonPayService.buildLink(
      this.validateMoonPayLink(payload),
      device,
    );
  }

  private normalizeProvider(
    provider: OnOffRampProvider,
  ): NormalizedRampProvider {
    switch (provider) {
      case OnOffRampProvider.ALCHEMY:
      case OnOffRampProvider.ALCHEMY_PAY:
        return OnOffRampProvider.ALCHEMY;
      case OnOffRampProvider.BANXA:
        return OnOffRampProvider.BANXA;
      case OnOffRampProvider.MOONPAY:
        return OnOffRampProvider.MOONPAY;
    }

    throw new BadRequestException('Unsupported on/off-ramp provider');
  }

  private normalizeSide(value: unknown, fallback?: Side): Side {
    if (value === undefined || value === null || value === '') {
      if (fallback) {
        return fallback;
      }
      throw new BadRequestException('side is required');
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('side must be buy or sell');
    }

    const side = value.toLowerCase();
    if (side === 'buy' || side === 'sell') {
      return side;
    }

    throw new BadRequestException('side must be buy or sell');
  }

  private validateDto<T extends object>(
    dto: new () => T,
    payload: RequestPayload,
  ): T {
    const instance = plainToInstance(dto, payload);
    const errors = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length) {
      throw new BadRequestException('Invalid on/off-ramp request payload');
    }

    return instance;
  }

  private validateMoonPayLink(payload: OnOffRampLinkPayloadDto): LinkDto {
    const linkPayload: RequestPayload = {
      side: this.normalizeSide(payload.side),
      code: this.requiredString(payload.code ?? payload.crypto, 'code'),
      amount: this.requiredNumber(payload.amount, 'amount'),
      fiat: this.optionalString(payload.fiat) ?? 'usd',
    };
    const wallet = this.optionalString(payload.wallet);
    if (wallet) {
      linkPayload.wallet = wallet;
    }

    return this.validateDto(LinkDto, linkPayload);
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
    return value;
  }

  private optionalString(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return this.requiredString(value, 'value');
  }

  private requiredNumber(value: unknown, field: string): number {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }
    return amount;
  }
}
