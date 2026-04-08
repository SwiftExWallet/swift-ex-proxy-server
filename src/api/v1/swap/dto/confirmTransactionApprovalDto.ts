import { IsNotEmpty, IsString } from 'class-validator';

export class CheckTransactionApprovalDto {
  @IsNotEmpty()
  @IsString()
  requestId: string;

  @IsNotEmpty()
  @IsString()
  txId: string;
}
