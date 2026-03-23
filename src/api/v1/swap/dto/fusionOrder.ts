import {
  IsEthereumAddress,
  IsNotEmpty,
  IsEnum,
  IsString,
} from 'class-validator';
import { SwapNetwork } from '../../common/enums/chain.enum';

export class FusionOrderDto {
  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  chain: SwapNetwork;

  @IsNotEmpty()
  quote: any;

  @IsNotEmpty()
  @IsEthereumAddress()
  tokenIn: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  tokenOut: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  walletAddress: string;

  @IsNotEmpty()
  @IsString()
  amount: string;
}
