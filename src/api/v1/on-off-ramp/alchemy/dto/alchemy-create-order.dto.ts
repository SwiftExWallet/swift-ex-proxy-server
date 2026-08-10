import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateBuyOrderDto {
  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @IsNotEmpty()
  fiatCurrency: string;

  @IsString()
  @IsNotEmpty()
  cryptoCurrency: string;

  @IsString()
  @IsOptional()
  address: string;

  @IsString()
  @IsNotEmpty()
  network: string;

  @IsString()
  @IsNotEmpty()
  payWayCode: string;

  @IsOptional()
  @IsString()
  memo?: string;
}
