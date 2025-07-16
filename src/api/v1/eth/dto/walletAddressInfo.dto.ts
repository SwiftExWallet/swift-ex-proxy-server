import { IsNotEmpty } from 'class-validator';

export class WalletAddressInfoDto {
  @IsNotEmpty()
  walletAddress: string;
}
