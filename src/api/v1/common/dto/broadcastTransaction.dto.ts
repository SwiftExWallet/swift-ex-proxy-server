import { IsNotEmpty } from 'class-validator';

export class BroadcastTransactionDto {
  @IsNotEmpty()
  signedTx: string;
}
