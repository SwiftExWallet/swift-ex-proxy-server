import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';

export class TokenParamDto {
  @IsNotEmpty()
  blockchain: string;

  @IsNotEmpty()
  symbol: string;

  @IsOptional()
  address?: string;
}
export class RangoRouteDto {
  @ValidateNested()
  @Type(() => TokenParamDto)
  from: TokenParamDto;

  @ValidateNested()
  @Type(() => TokenParamDto)
  to: TokenParamDto;

  @IsNotEmpty()
  amount: string;

  @IsNotEmpty()
  slippage: string;
}
