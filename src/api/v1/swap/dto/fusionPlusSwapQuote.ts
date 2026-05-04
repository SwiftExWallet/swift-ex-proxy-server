import {
  IsEthereumAddress,
  IsNotEmpty,
  IsEnum,
  IsString,
} from 'class-validator';
import { SwapNetwork } from '../../common/enums/chain.enum';

export class FusionPlusSwapQuoteDto {
  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  srcChain: SwapNetwork;

  @IsNotEmpty()
  @IsEnum(SwapNetwork)
  dstChain: SwapNetwork;

  @IsNotEmpty()
  @IsEthereumAddress()
  srcTokenAddress: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  dstTokenAddress: string;

  @IsNotEmpty()
  @IsEthereumAddress()
  walletAddress: string;

  @IsNotEmpty()
  @IsString()
  amount: string;
}
