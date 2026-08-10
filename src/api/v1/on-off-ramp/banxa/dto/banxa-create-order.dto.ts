import { IsString, IsOptional } from 'class-validator';

export class CreateOrderDto {
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
  fiatAmount: string;

  @IsString()
  @IsOptional()
  cryptoAmount: string;

  @IsString()
  walletAddress: string;
}
