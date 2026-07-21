import { IsBoolean, IsEthereumAddress, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class FusionPlusOrderDto {
  @IsNotEmpty()
  quoteId: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  walletAddress: string;

  @IsNotEmpty()
  @IsInt()
  secretCount: number;
  
  @IsOptional()
  @IsBoolean()
  requiresApprovalTransaction: boolean;
}
