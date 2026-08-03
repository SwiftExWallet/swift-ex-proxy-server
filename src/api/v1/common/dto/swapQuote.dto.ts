import {
  Allow,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SUPPORTED_QUOTE_CHAIN_IDS } from '../enums/chain.enum';

export enum SwapQuoteOption {
  GAS = 'gas',
  GASLESS = 'gasLess',
}

const SWAP_QUOTE_OPTIONS = [
  SwapQuoteOption.GAS,
  SwapQuoteOption.GASLESS,
  '',
] as const;

export class TokenInfoDto {
  @Matches(
    /^0x[a-fA-F0-9]{40}$|^G[A-Z0-9]{55}$|^[A-Z0-9]{1,12}-G[A-Z0-9]{55}$/,
    { message: 'Invalid public key format' },
  )
  address: string;

  @Type(() => Number)
  @IsNotEmpty()
  @IsInt()
  @IsIn(SUPPORTED_QUOTE_CHAIN_IDS, { message: 'Unsupported chainId' })
  chainId: number;

  @Allow()
  symbol?: string;

  @Allow()
  decimals?: string;
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

  @IsOptional()
  @IsString()
  recipient: string;

  @Transform(({ value }) =>
    value === '' || value === undefined || value === null
      ? undefined
      : Number(value),
  )
  @IsOptional()
  @IsNumber()
  slippage?: number;

  @IsOptional()
  @IsIn(SWAP_QUOTE_OPTIONS)
  option?: SwapQuoteOption | '';
}

export interface ResolvedTokenInfoDto extends TokenInfoDto {
  symbol: string;
  decimals: string;
}

export type ResolvedSwapQuoteDto = Omit<
  SwapQuoteDto,
  'tokenIn' | 'tokenOut'
> & {
  tokenIn: ResolvedTokenInfoDto;
  tokenOut: ResolvedTokenInfoDto;
};
