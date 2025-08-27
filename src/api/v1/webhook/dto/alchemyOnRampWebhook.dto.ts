import { IsString, IsEmail, IsOptional, IsNotEmpty } from 'class-validator';

export class AlchemyOnRampWebhookDto {
  @IsString()
  @IsNotEmpty()
  appId: string;

  @IsString()
  @IsNotEmpty()
  orderNo: string;

  @IsString()
  @IsNotEmpty()
  merchantOrderNo: string;

  @IsString()
  @IsOptional()
  merchantUid: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  crypto: string;

  @IsString()
  @IsNotEmpty()
  cryptoPrice: string;

  @IsString()
  cryptoQuantity: string;

  @IsString()
  fiat: string;

  @IsString()
  amount: string;

  @IsString()
  payType: string;

  @IsString()
  network: string;

  @IsString()
  address: string;

  @IsString()
  @IsOptional()
  payTime: string;

  @IsString()
  @IsOptional()
  txTime: string;

  @IsString()
  @IsOptional()
  txHash: string;

  @IsString()
  status: string;

  @IsString()
  @IsOptional()
  message: string;

  @IsString()
  rampFee: string;

  @IsString()
  @IsOptional()
  timestamp: string;
}
