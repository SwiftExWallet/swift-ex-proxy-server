import { IsEthereumAddress, IsNotEmpty } from 'class-validator';

export class GetPortfolioDto {
  @IsEthereumAddress()
  @IsNotEmpty()
  address: string;
}
