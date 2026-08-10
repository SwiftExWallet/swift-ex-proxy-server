import { IsString, IsIn } from 'class-validator';

export class AlchemyQuotesDto {
  @IsString()
  crypto: string;

  @IsString()
  network: string;

  @IsString()
  fiat: string;

  @IsString()
  amount: string;

  @IsString()
  @IsIn(['SELL', 'BUY'])
  side: string;
}
