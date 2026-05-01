import { IsEnum, IsNotEmpty, IsOptional, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ChainId } from '../enums/chain.enum';

export class TokenInfoDto {
  @Matches(
    /^0x[a-fA-F0-9]{40}$|^G[A-Z0-9]{55}$|^[A-Z0-9]{1,12}-G[A-Z0-9]{55}$/,
    { message: 'Invalid public key format' }
  )
  address: string;

  @IsNotEmpty()
  symbol: string;

  @IsNotEmpty()
  @IsEnum(ChainId)
  chainId: number;

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
}
