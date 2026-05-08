import {
  IsEnum,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { SwapNetwork } from '../../common/enums/chain.enum';

export class InchOrderStatusDto {
  @IsNotEmpty()
  @IsString()
  orderHash: string;

  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  chain: SwapNetwork;
}
