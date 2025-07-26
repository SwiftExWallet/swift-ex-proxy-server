import { IsEthereumAddress, IsNotEmpty } from 'class-validator';

export class UsdtSwapQuoteDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  fromAddress: string;

  @IsNotEmpty()
  amount: string;
}
