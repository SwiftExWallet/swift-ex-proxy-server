import { IsEthereumAddress, IsNotEmpty } from 'class-validator';

export class PrepareTransactionDto {
  @IsNotEmpty()
  unsignedTx: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  walletAddress: string;
}
