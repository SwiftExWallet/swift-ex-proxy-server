import { IsEthereumAddress, IsNotEmpty } from 'class-validator';

export class GetTokenInfoDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  addresses: string[] | string;

  @IsNotEmpty()
  @IsEthereumAddress()
  walletAddress: string;
}
