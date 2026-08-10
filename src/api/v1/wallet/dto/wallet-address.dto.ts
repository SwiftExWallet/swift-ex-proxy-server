import { IsEnum, IsEthereumAddress, IsNotEmpty } from 'class-validator';
import { SupportedWalletChain } from '../../common/enums/chain.enum';

export class WalletAddressDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  walletAddress: string;

  @IsNotEmpty()
  @IsEnum(SupportedWalletChain)
  chain: SupportedWalletChain;
}
