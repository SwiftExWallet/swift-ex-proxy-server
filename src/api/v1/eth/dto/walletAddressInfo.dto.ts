import { IsEthereumAddress, IsNotEmpty } from 'class-validator';

export class WalletAddressInfoDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  walletAddress: string;
}
