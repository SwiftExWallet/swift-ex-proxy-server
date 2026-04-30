import { IsEthereumAddress, IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TokenInfoDto {
  @IsNotEmpty()
  @IsEthereumAddress()
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

  @IsNotEmpty()
  recipient:string;

  @IsOptional()
  slippage?:number

  @IsNotEmpty()
  chainId: string;
}
