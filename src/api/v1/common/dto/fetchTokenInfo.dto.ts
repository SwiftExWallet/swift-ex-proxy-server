import { IsEthereumAddress, IsNotEmpty, IsOptional } from 'class-validator';
import { ValidateEthereumAddresses } from '../validation/ethereumAddress';

export class GetTokenInfoDto {
  @IsNotEmpty()
  @ValidateEthereumAddresses()
  addresses: string[] | string;

  @IsOptional()
  @IsEthereumAddress()
  walletAddress: string;
}
