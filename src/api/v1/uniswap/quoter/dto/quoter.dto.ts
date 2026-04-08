import { IsEnum, IsNotEmpty, IsNumberString, IsString, IsOptional } from 'class-validator';

export enum SupportedChain {
  ETH = 'eth',
  BNB = 'bnb',
  POLYGON = 'pol',
  ARB = 'arb',
  BASE = 'base',
  AVAX = 'avax',
  OPT = 'opt',
}

export enum TradeType {
  EXACT_IN = 'exactIn',
  EXACT_OUT = 'exactOut',
}

export class GetQuoteDto {
  @IsEnum(SupportedChain)
  chain: SupportedChain;

  @IsString()
  @IsNotEmpty()
  tokenIn: string;

  @IsString()
  @IsNotEmpty()
  tokenOut: string;

  @IsNumberString()
  amount: string;

  @IsEnum(TradeType)
  @IsOptional()
  tradeType?: TradeType = TradeType.EXACT_IN;

  @IsOptional()
  @IsNumberString()
  slippage?: string;
}