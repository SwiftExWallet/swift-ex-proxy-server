import { IsString, Matches } from 'class-validator';

export class RecoveryOwnerDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/)
  owner!: string;
}

export class RecoveryTransactionConfirmationDto extends RecoveryOwnerDto {
  @IsString()
  transactionHash!: string;
}
