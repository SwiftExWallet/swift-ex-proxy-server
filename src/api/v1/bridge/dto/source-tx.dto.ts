import { IsNotEmpty, IsString } from 'class-validator';

export class SourceTxDto {
  @IsString()
  @IsNotEmpty()
  txHash: string;
}
