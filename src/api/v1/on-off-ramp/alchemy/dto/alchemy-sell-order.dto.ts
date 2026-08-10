import { IsString, IsNotEmpty } from 'class-validator';

export class SellOrderDto {
  @IsString()
  @IsNotEmpty()
  crypto: string;

  @IsString()
  @IsNotEmpty()
  network: string;

  @IsString()
  @IsNotEmpty()
  cryptoAmount: string;

  @IsString()
  @IsNotEmpty()
  fiat: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  redirectUrl: string = process.env.ALCHEMY_PAY_SELL_REDIRECT as string;
  callbackUrl: string = process.env.ALCHEMY_PAY_SELL_WEBHOOK as string;
  language: string = 'en-US';
  showTable: string = 'sell';
}

export function buildAlchemySellOrderPayload(requestPayload: SellOrderDto) {
  return {
    ...requestPayload,
    appId: process.env.ALCHEMY_PAY_APPID as string,
    type: 'sell',
    timestamp: Date.now().toString(),
    redirectUrl: process.env.ALCHEMY_PAY_SELL_REDIRECT,
    callbackUrl: process.env.ALCHEMY_PAY_SELL_WEBHOOK,
    language: 'en-US',
    showTable: 'sell',
  };
}
