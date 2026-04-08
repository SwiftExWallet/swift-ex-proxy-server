import { IsOptional, IsString, IsArray, ValidateIf } from 'class-validator';
import { ValidWalletType } from '../enums/all-bridge.enum';

export class BroadcastTransactionDto {
  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.signedTransactions)
  signedTx?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ValidateIf((o) => !o.signedTx)
  signedTransactions?: string[];

  @IsOptional()
  @IsString()
  broadcastChain: ValidWalletType;
}