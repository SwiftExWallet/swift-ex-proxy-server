import { IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TokenInfoDto {
  @IsNotEmpty()
  address: string;

  @IsNotEmpty()
  symbol: string;

  @IsNotEmpty()
  decimals: string;
}

export class SwapQuoteDto {
  @ValidateNested()
  @Type(() => TokenInfoDto)
  tokenIn: TokenInfoDto;

  @ValidateNested()
  @Type(() => TokenInfoDto)
  tokenOut: TokenInfoDto;

  @IsNotEmpty()
  amount: string;
}
