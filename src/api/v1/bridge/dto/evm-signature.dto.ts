import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class EvmSignatureDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[0-9a-fA-F]+$/, {
    message: 'signedTx must be a hex encoded EVM transaction',
  })
  signedTx: string;
}
