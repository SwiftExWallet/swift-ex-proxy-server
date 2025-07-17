import { IsNotEmpty } from 'class-validator';

export class SwapTransactionDto {
  @IsNotEmpty()
  to: string;
  data: string;
  value?: string;
  gasLimit: number;
  nonce: number;
  chainId: bigint;
  type: number;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}
