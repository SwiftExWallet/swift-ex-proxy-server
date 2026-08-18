import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AssetsDto, BanxaQuotesDto, OrderType } from './dto/banxa-quotes.dto';
import { CreateOrderDto } from './dto/banxa-create-order.dto';
import { HttpRequestMethod } from '../../common/enums/httpRequest.enum';
import { Device } from '../../device/schema/device.schema';
import {
  HttpService,
  HttpServiceResponse,
} from '../../common/services/httpService';

type BanxaHeaders = Record<string, string>;

@Injectable()
export class BanxaService {
  private readonly logger = new Logger(BanxaService.name);
  private readonly banxaApiKey = process.env.BANXA_API_KEY as string;
  private readonly banxaQuoteRoute = process.env
    .BANXA_QUOTE_REQUEST_URL as string;
  private readonly banxaBaseRoute = process.env.BANXA_BASE_URL as string;
  constructor(private readonly httpService: HttpService) {}

  async fetchQuotes(payload: BanxaQuotesDto): Promise<HttpServiceResponse> {
    try {
      this.logger.log('====fetching banxa quotes started===');
      const headers = this.buildAppHeaders(this.banxaApiKey);

      return this.httpService.request({
        body: payload,
        method: HttpRequestMethod.GET,
        url: this.banxaQuoteRoute + payload.orderType,
        headers,
      });
    } catch (error: any) {
      this.logger.error('failed to fetching banxa quotes: ', error);
      throw new BadRequestException(
        `failed to fetching banxa quotes: ${error.message}`,
      );
    }
  }

  async buyOrderCreate(
    createOrder: CreateOrderDto,
    currentDevice?: Device,
  ): Promise<HttpServiceResponse | void> {
    try {
      this.logger.log('====banxa buy order create started===');
      const headers = this.buildAppHeaders(this.banxaApiKey);
      const deviceId = this.getDeviceId(currentDevice);
      const payload = {
        ...createOrder,
        externalOrderId: deviceId,
        externalCustomerId: deviceId,
        redirectUrl: process.env.BANXA_REDIRECT_URL,
      };
      return this.httpService.request({
        body: payload,
        method: HttpRequestMethod.POST,
        url: this.banxaBaseRoute + 'v2/buy',
        headers,
      });
    } catch (error: any) {
      this.logger.error('failed to create banxa buy order: ', error);
      throw new BadRequestException(
        `failed to create banxa buy order: ${error.message}`,
      );
    }
  }

  async sellOrderCreate(
    createOrder: CreateOrderDto,
    currentDevice?: Device,
  ): Promise<HttpServiceResponse | void> {
    try {
      this.logger.log('====banxa sell order create started===');
      const headers = this.buildAppHeaders(this.banxaApiKey);
      const deviceId = this.getDeviceId(currentDevice);
      const payload = {
        ...createOrder,
        externalCustomerId: deviceId,
        externalOrderId: deviceId,
        redirectUrl: process.env.BANXA_REDIRECT_URL,
      };
      return this.httpService.request({
        body: payload,
        method: HttpRequestMethod.POST,
        url: this.banxaBaseRoute + 'v2/sell',
        headers,
      });
    } catch (error: any) {
      this.logger.error('failed to create banxa sell order: ', error);
      throw new BadRequestException(
        `failed to create banxa sell order: ${error.message}`,
      );
    }
  }

  async fetchAssets(payload: AssetsDto): Promise<HttpServiceResponse> {
    try {
      const headers = this.buildAppHeaders(this.banxaApiKey);

      if (payload.orderType === OrderType.BUY) {
        return this.fetchBuyAssets(payload, headers);
      }

      return this.fetchSellAssets(payload, headers);
    } catch (error: any) {
      this.logger.error('failed to fetching banxa assets: ', error);
      throw new BadRequestException(
        `failed to fetching banxa assets: ${error.message}`,
      );
    }
  }

  private async fetchBuyAssets(
    payload: AssetsDto,
    headers: BanxaHeaders,
  ): Promise<HttpServiceResponse> {
    const [crypto, fiats, paymentMethods] = await Promise.all([
      this.httpService.get({
        body: payload,
        method: HttpRequestMethod.GET,
        url: this.banxaBaseRoute + `v2/crypto`,
        headers,
      }),
      this.httpService.get({
        body: payload,
        method: HttpRequestMethod.GET,
        url: this.banxaBaseRoute + `v2/fiats`,
        headers,
      }),
      this.httpService.get({
        body: payload,
        method: HttpRequestMethod.GET,
        url: this.banxaBaseRoute + `v2/payment-methods`,
        headers,
      }),
    ]);
    return {
      ...crypto,
      data: {
        status: true,
        order_type: OrderType.BUY,
        crypto_assets: crypto.data ?? [],
        fiat_currencies: fiats.data ?? [],
        payment_methods: (
          paymentMethods.data?.data?.payment_methods ?? []
        ).filter((pm: { type: string }) => pm.type === 'buy'),
      },
    };
  }

  private async fetchSellAssets(
    payload: AssetsDto,
    headers: BanxaHeaders,
  ): Promise<HttpServiceResponse> {
    const [crypto, paymentMethods, countries] = await Promise.all([
      this.httpService.get({
        body: payload,
        method: HttpRequestMethod.GET,
        url: this.banxaBaseRoute + `v2/crypto`,
        headers,
      }),
      this.httpService.get({
        body: payload,
        method: HttpRequestMethod.GET,
        url: this.banxaBaseRoute + `v2/payment-methods`,
        headers,
      }),
      this.httpService.get({
        body: payload,
        method: HttpRequestMethod.GET,
        url:
          this.banxaBaseRoute + `v2/countries?orderType=${payload.orderType}`,
        headers,
      }),
    ]);
    return {
      ...crypto,
      data: {
        status: true,
        order_type: OrderType.SELL,
        crypto_assets: crypto.data ?? [],
        payout_methods: paymentMethods.data ?? [],
        supported_countries: (countries.data?.data?.countries ?? []).map(
          (c: { country_code: string }) => c.country_code,
        ),
      },
    };
  }

  private buildAppHeaders(apiKey: string): BanxaHeaders {
    return {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    };
  }

  private getDeviceId(currentDevice?: Device): string {
    const deviceId = currentDevice?._id as unknown;

    if (typeof deviceId === 'string') {
      return deviceId;
    }

    if (
      deviceId &&
      typeof deviceId === 'object' &&
      'toHexString' in deviceId &&
      typeof deviceId.toHexString === 'function'
    ) {
      return deviceId.toHexString();
    }

    return randomUUID();
  }
}
