import { IsNotEmpty, IsString } from 'class-validator';

export class StellarSignatureDto {
  @IsString()
  @IsNotEmpty()
  signedXdr: string;
}
