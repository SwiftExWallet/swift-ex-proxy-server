import { IsEthereumAddress, IsNotEmpty, IsOptional } from 'class-validator';

export class PrepareTransactionDto {
  @IsNotEmpty()
  unsignedTx: string;

  @IsOptional()
  @IsEthereumAddress()
  walletAddress: string;
}
