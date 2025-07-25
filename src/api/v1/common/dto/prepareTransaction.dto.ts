import { IsNotEmpty } from 'class-validator';

export class PrepareTransactionDto {
  @IsNotEmpty()
  unsignedTx: string;

  @IsNotEmpty()
  walletAddress: string;
}
