import { IsEthereumAddress, IsNotEmpty } from 'class-validator';

export class WalletAddressDto {
  @IsEthereumAddress()
  @IsNotEmpty()
  walletAddress: string;
}
