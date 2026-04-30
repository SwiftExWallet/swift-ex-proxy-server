import { IsEnum, IsNotEmpty, IsNumberString, IsString, IsOptional } from 'class-validator';
import { swapProvider } from 'src/api/v1/common/enums/chain.enum';

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
  @IsNotEmpty()
  @IsEnum(swapProvider)
  provider: swapProvider;

  @IsNotEmpty()
  data: any;
}