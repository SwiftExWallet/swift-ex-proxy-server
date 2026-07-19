import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { SwapNetwork } from '../../common/enums/chain.enum';

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
