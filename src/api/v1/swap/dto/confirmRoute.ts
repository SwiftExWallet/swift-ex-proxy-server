import { IsEthereumAddress, IsNotEmpty, IsString } from 'class-validator';

export class ConfirmRouteDto {
  @IsString()
  @IsNotEmpty()
  requestId: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  toAddress: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  fromAddress: string;

  @IsNotEmpty()
  sourceChain: string;

  @IsNotEmpty()
  destinationChain: string;
}
