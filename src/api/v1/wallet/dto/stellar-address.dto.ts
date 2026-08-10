import { IsNotEmpty } from 'class-validator';

export class StellarAddressDto {
  @IsNotEmpty()
  stellarAddress: string;
}
