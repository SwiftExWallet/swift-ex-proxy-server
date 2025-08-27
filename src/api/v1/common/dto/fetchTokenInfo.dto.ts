import { IsEthereumAddress, IsNotEmpty } from 'class-validator';
import { ValidateEthereumAddresses } from '../validation/ethereumAddress';

export class GetTokenInfoDto {
  @IsNotEmpty()
  @ValidateEthereumAddresses()
  addresses: string[] | string;

  @IsNotEmpty()
  @IsEthereumAddress()
  walletAddress: string;
}
