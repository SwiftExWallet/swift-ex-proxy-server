import {
  IsEthereumAddress,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class FusionPlusOrderDto {
  @IsNotEmpty()
  quoteId: string;

  @IsOptional()
  @IsEthereumAddress()
  walletAddress: string;

  @IsNotEmpty()
  @IsInt()
  secretCount: number;

  @IsOptional()
  @IsBoolean()
  requiresApprovalTransaction: boolean;
}
