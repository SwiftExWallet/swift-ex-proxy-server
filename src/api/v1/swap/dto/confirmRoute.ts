import { IsEthereumAddress, IsNotEmpty, IsString, Matches } from 'class-validator';

export class ConfirmRouteDto {
  @IsString()
  @IsNotEmpty()
  requestId: string;

  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$|^G[A-Z0-9]{55}$/, {
      message: 'Invalid public key format',
    })
  toAddress: string;

  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$|^G[A-Z0-9]{55}$/, {
      message: 'Invalid public key format',
    })
  fromAddress: string;

  @IsNotEmpty()
  sourceChain: string;

  @IsNotEmpty()
  destinationChain: string;
}
