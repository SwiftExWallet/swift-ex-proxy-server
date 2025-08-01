import { IsEthereumAddress, IsNotEmpty } from 'class-validator';
import { TokenInfoDto } from '../../common/dto/swapQuote.dto';
import { Type } from 'class-transformer';

export class PrepareSwapTransactionDto {
  @IsNotEmpty()
  @IsEthereumAddress()
  address: string;

  @IsNotEmpty()
  bnbAmount: string;

  @IsNotEmpty()
  @Type(() => TokenInfoDto)
  tokenIn: TokenInfoDto;

  @IsNotEmpty()
  @Type(() => TokenInfoDto)
  tokenOut: TokenInfoDto;
}
