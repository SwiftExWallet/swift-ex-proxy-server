import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export class RecoveryRegistrationAssetDto {
  @IsIn(['native', 'classic', 'contract'])
  type!: 'native' | 'classic' | 'contract';

  @IsOptional()
  @IsString()
  @Matches(/^C[A-Z2-7]{55}$/)
  token?: string;

  @IsString()
  @Matches(/^\d+$/)
  floor!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  issuer?: string;
}

export class RecoveryRegistrationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  walletAddress!: string;

}

export class RecoveryRegistrationPrepareDto extends RecoveryRegistrationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => RecoveryRegistrationAssetDto)
  assets!: RecoveryRegistrationAssetDto[];
}

export class RecoveryRegistrationConfirmationDto extends RecoveryRegistrationDto {
  @IsString()
  transactionHash!: string;
}
