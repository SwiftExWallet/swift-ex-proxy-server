import { IsEnum, IsEthereumAddress, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { SwapNetwork } from '../../common/enums/chain.enum';

export class PrepareTxDto {
  @IsNotEmpty()
  requestId: string;

  @IsNotEmpty()
  swaps: number;
}

export class ConfirmSwapOrderDto {
  @IsNotEmpty()
  @IsString()
  orderHash: string;

  @IsNotEmpty()
  @IsString()
  txHash: string;

  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  srcChain: SwapNetwork;
}