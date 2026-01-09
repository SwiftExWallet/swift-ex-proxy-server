import { IsOptional, IsString, IsArray, ValidateIf } from 'class-validator';

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
}