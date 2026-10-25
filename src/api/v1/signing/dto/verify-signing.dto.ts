import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifySigningDto {
  @IsOptional()
  @IsIn(['evm', 'stellar'])
  chain?: 'evm' | 'stellar';

  @IsNotEmpty()
  @IsString()
  payload: string;

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  signedXdr?: string;

  @IsOptional()
  @IsString()
  stellarAddress?: string;
}
