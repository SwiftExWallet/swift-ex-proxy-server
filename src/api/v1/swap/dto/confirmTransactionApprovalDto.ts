import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CheckTransactionApprovalDto {
  @IsNotEmpty()
  @IsString()
  requestId: string;

  @IsNotEmpty()
  @IsString()
  txId: string;

  @IsOptional()
  @IsNumber()
  step: number = 1;
}
