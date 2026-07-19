import { IsEthereumAddress, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class FusionPlusOrderDto {
  @IsNotEmpty()
  quoteId: string;

  @IsOptional()
  @IsEthereumAddress()
  walletAddress: string;

  @IsNotEmpty()
  @IsInt()
  secretCount: number;
}
