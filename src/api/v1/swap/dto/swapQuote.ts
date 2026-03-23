import {
  IsEthereumAddress,
  IsNotEmpty,
  IsEnum,
  IsString,
} from 'class-validator';
import { SwapNetwork } from '../../common/enums/chain.enum';

export class SwapQuoteDto {
  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  chain: SwapNetwork;

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
