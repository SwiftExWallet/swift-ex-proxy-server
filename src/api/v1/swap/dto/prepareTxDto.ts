import { IsNotEmpty } from 'class-validator';

export class PrepareTxDto {
  @IsNotEmpty()
  requestId: string;

  @IsNotEmpty()
  swaps: number;
}
