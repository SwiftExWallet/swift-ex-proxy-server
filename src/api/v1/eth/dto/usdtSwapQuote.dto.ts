import { IsEthereumAddress, IsNotEmpty, IsOptional } from 'class-validator';

export class UsdtSwapQuoteDto {
  @IsOptional()
  @IsEthereumAddress()
  fromAddress: string;

  @IsNotEmpty()
  amount: string;
}
