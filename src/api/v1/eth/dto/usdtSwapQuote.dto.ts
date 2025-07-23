import { IsNotEmpty } from 'class-validator';

export class UsdtSwapQuoteDto {
  @IsNotEmpty()
  fromAddress: string;

  @IsNotEmpty()
  amount: string;
}
