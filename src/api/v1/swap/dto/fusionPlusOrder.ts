import { IsEthereumAddress, IsInt, IsNotEmpty } from 'class-validator';

export class FusionPlusOrderDto {
  @IsNotEmpty()
  quoteId: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  walletAddress: string;

  @IsNotEmpty()
  @IsInt()
  secretCount: number;
}
