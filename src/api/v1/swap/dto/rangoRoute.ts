import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

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

  @IsOptional()
  @IsString()
  slippage: string = '1.0';
}
