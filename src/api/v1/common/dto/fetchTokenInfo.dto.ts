import { IsNotEmpty } from 'class-validator';

export class GetTokenInfoDto {
  @IsNotEmpty()
  addresses: string[] | string;

  @IsNotEmpty()
  walletAddress: string;
}
