import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ValidWalletType } from '../enums/all-bridge.enum';

const MAX_SIGNED_TRANSACTION_LENGTH = 20_000;
const MAX_SIGNED_TRANSACTION_BATCH_SIZE = 5;

export class BroadcastTransactionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SIGNED_TRANSACTION_LENGTH)
  @ValidateIf((o) => !o.signedTransactions)
  signedTx?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SIGNED_TRANSACTION_BATCH_SIZE)
  @IsString({ each: true })
  @MaxLength(MAX_SIGNED_TRANSACTION_LENGTH, { each: true })
  @ValidateIf((o) => !o.signedTx)
  signedTransactions?: string[];

  @IsOptional()
  @IsString()
  broadcastChain: ValidWalletType;
}
