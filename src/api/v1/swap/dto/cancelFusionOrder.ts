import { IsNotEmpty, IsEnum, IsString } from 'class-validator';
import { SwapNetwork } from '../../common/enums/chain.enum';

export class CancelFusionOrderDto {
  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  chain: SwapNetwork;

  @IsNotEmpty()
  @IsString()
  orderHash: string;
}
