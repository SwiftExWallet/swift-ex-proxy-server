import { IsString, IsIn, IsOptional, IsEnum } from 'class-validator';
export class BanxaQuotesDto {
  @IsString()
  paymentMethodId: string;

  @IsString()
  crypto: string;

  @IsString()
  blockchain: string;

  @IsString()
  fiat: string;

  @IsString()
  @IsOptional()
  cryptoAmount: string;

  @IsString()
  @IsOptional()
  fiatAmount: string;

  @IsString()
  @IsIn(['sell', 'buy'])
  orderType: string;
}

export enum OrderType {
  BUY = 'buy',
  SELL = 'sell',
}

export class AssetsDto {
  @IsEnum(OrderType)
  orderType: OrderType;
}
