import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { UrlSigner } from './util/urlSigner';
import { HttpService } from './http.service';
import { AxiosHeaders } from 'axios';
import { AxiosResponse } from '../../common/interface/axiosResponse';
import * as crypto from 'crypto';
import { CreateBuyOrderDto } from './dto/alchemy-create-order.dto';
import {
  buildAlchemySellOrderPayload,
  SellOrderDto,
} from './dto/alchemy-sell-order.dto';
import { HttpRequestMethod } from '../../common/enums/httpRequest.enum';

@Injectable()
export class AlchemyService {
  private readonly logger = new Logger(UrlSigner.name);
  constructor(
    private readonly urlSigner: UrlSigner,
    private readonly httpService: HttpService,
  ) {}

  async fetchQuotes(payload: Record<string, any>): Promise<AxiosResponse> {
    try {
      this.logger.log('==== getting alchemy quotes started===');
      //   const timestamp = Date.now().toString(); // can we change it to iso string ?
      const timestamp = Date.now().toString();
      const sign: string = this.urlSigner.signPayload(
        timestamp,
        payload,
        HttpRequestMethod.POST,
        process.env.ALCHEMY_PAY_QUOTE_REQUEST_URL as string,
      );
      this.logger.log('==== fetching alchemy quotes ===');
      const headers = this.buildAppHeaders(timestamp, sign);
      this.logger.log('==== getting alchemy quotes end===');
      return this.httpService.request({
        body: payload,
        method: HttpRequestMethod.POST,
        url: process.env.ALCHEMY_PAY_QUOTE_REQUEST_URL as string,
        headers,
      });
    } catch (error: any) {
      this.logger.error('fetchQuotes Error', error);
      throw new BadRequestException(`fetching Quotes failed: ${error.message}`);
    }
  }

  async registerUser(payload: any): Promise<AxiosResponse> {
    try {
      const timestamp = new Date().toISOString();
      const sign: string = this.urlSigner.signPayload(
        timestamp,
        payload,
        HttpRequestMethod.POST,
        process.env.ALCHEMY_PAY_REGISTER_USER_REQUEST_URL as string,
      );
      const headers = this.buildAchAccessHeaders(timestamp, sign);

      return this.httpService.request({
        body: payload,
        method: HttpRequestMethod.POST,
        url: process.env.ALCHEMY_PAY_REGISTER_USER_REQUEST_URL as string,
        headers,
      });
    } catch (error: any) {
      this.logger.error('alchemyUserRegister Error', error);
      throw new BadRequestException(
        `AlchemyUserRegister failed: ${error.message}`,
      );
    }
  }

  async userStatus(payload): Promise<AxiosResponse> {
    try {
      this.logger.log('==== alchemy user status check started ===');
      const timestamp = new Date().toISOString();
      const sign: string = this.urlSigner.signPayload(
        timestamp,
        payload,
        HttpRequestMethod.POST,
        process.env.ALCHEMY_PAY_USER_KYC_STATUS_REQUEST_URL as string,
      );
      const headers = this.buildAchAccessHeaders(timestamp, sign);

      return this.httpService.request({
        body: payload,
        method: HttpRequestMethod.POST,
        url: process.env.ALCHEMY_PAY_USER_KYC_STATUS_REQUEST_URL as string,
        headers,
      });
    } catch (error: any) {
      this.logger.error('alchemyUserStatus Error', error);
      throw new BadRequestException(
        `alchemyUserStatus failed: ${error.message}`,
      );
    }
  }

  orderCreate(createBuyOrderDto: CreateBuyOrderDto): string {
    this.logger.log('==== creating alchemy buy started===');
    const orderTimestamp = Date.now().toString();
    const { fiatCurrency, amount, cryptoCurrency, network, address } =
      createBuyOrderDto;
    const buyPayload = {
      appId: process.env.ALCHEMY_PAY_APPID as string,
      merchantOrderNo: Math.floor(
        1000000000 + Math.random() * 9000000000,
      ).toString(),
      timestamp: Date.now().toString(),
      fiat: fiatCurrency,
      fiatAmount: amount,
      crypto: cryptoCurrency,
      network: network,
      address: address,
      displayAddress: true,
      type: 'buy',
      redirectUrl: process.env.ALCHEMY_PAY_REDIRECT_URL,
      callbackUrl: process.env.ALCHEMY_PAY_WEBHOOK_URL,
      language: 'en-US',
      showTable: 'buy',
    };
    const rawDataToSign = this.getStringToSign(buyPayload);
    const requestPathWithParams = '/index/rampPageBuy' + '?' + rawDataToSign;
    const onRampSignature = this.generateSignature(
      orderTimestamp,
      HttpRequestMethod.GET,
      requestPathWithParams,
      process.env.ALCHEMY_PAY_SECRET as string,
    );
    this.logger.log('==== alchemy buy order created ===');
    const finalUrl =
      process.env.ALCHEMY_PAY_USER_SELL_ORDER_URL +
      rawDataToSign +
      '&sign=' +
      onRampSignature;

    return finalUrl;
  }

  sellOrderCreate(payload: SellOrderDto): string {
    this.logger.log('==== creating alchemy sell order ===');
    const sellPayload = buildAlchemySellOrderPayload(payload);

    const rawDataToSign = this.getStringToSign(sellPayload);
    const requestPathWithParams =
      process.env.ALCHEMY_PAY_USER_SELL_ORDER_REQUEST_URL + '?' + rawDataToSign;
    const onRampSignature = this.generateSignature(
      sellPayload.timestamp,
      HttpRequestMethod.GET,
      requestPathWithParams,
      process.env.ALCHEMY_PAY_SECRET as string,
    );
    this.logger.log('==== alchemy sell order created ===');
    const finalUrl =
      process.env.ALCHEMY_PAY_USER_SELL_ORDER_URL +
      rawDataToSign +
      '&sign=' +
      onRampSignature;

    return finalUrl;
  }

  // Function to sort parameters and return a string to sign
  private getStringToSign(params: Record<string, any>): string {
    const sortedKeys: string[] = Object.keys(params).sort();
    this.logger.log('==== alchemy sorted Keys creation started===');
    const s2s: string = sortedKeys
      .map((key: string) => {
        const value = params[key];
        if (Array.isArray(value) || value === '') {
          return null;
        }
        return `${key}=${value}`;
      })
      .filter((item): item is string => Boolean(item))
      .join('&');
    this.logger.log('==== alchemy sorted Keys creation end===');
    return s2s;
  }

  // Function to generate HMAC SHA256 signature
  private generateSignature(
    timestamp: string,
    httpMethod: string,
    requestPath: string,
    secretKey: string,
  ): string {
    // Concatenate parameters for signature string
    this.logger.log('==== alchemy signature creation started===');
    const signatureString: string = timestamp + httpMethod + requestPath;

    // Generate HMAC SHA256 signature using the secret key
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(signatureString);
    const signature: string = hmac.digest('base64');
    this.logger.log('==== alchemy signature creation end===');
    return encodeURIComponent(signature);
  }

  private buildAppHeaders(timestamp: string, sign: string) {
    const headers = new AxiosHeaders();
    headers.set('appid', process.env.ALCHEMY_PAY_APPID as string);
    headers.set('timestamp', timestamp);
    headers.set('sign', sign);
    headers.set('Content-Type', 'application/json');
    return headers;
  }

  private buildAchAccessHeaders(timestamp: string, sign: string) {
    const headers = new AxiosHeaders();
    headers.set('ach-access-key', process.env.ALCHEMY_PAY_APPID as string);
    headers.set('ach-access-timestamp', timestamp.toString());
    headers.set('ach-access-sign', sign);
    headers.set('Content-Type', 'application/json');
    return headers;
  }

  private async getAuthAccessToken(timestamp: string, uid: string) {
    this.logger.log('==== getting alchemy auth access token started===');
    const sign: string = this.urlSigner.signPayload(
      timestamp,
      { uid },
      HttpRequestMethod.POST,
      process.env.ALCHEMY_PAY_USER_AUTH_TOKEN_REQUEST_URL as string,
    );
    const headers = this.buildAppHeaders(timestamp, sign);
    this.logger.log('==== getting alchemy auth access token end===');
    return this.httpService.request({
      body: { uid },
      method: HttpRequestMethod.POST,
      url: process.env.ALCHEMY_PAY_USER_AUTH_TOKEN_REQUEST_URL as string,
      headers,
    });
  }
}
