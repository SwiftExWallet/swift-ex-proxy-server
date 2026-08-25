import { IsNotEmpty, IsString } from 'class-validator';

export class VerifySigningDto {
  @IsNotEmpty()
  @IsString()
  payload: string;

  @IsNotEmpty()
  @IsString()
  signature: string;
}
