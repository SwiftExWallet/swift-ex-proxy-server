import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export type Side = 'buy' | 'sell';

export class CurrenciesDto {
  @IsOptional()
  @IsEnum(['buy', 'sell'])
  side?: Side = 'buy';
}

export class QuoteDto {
  @IsEnum(['buy', 'sell'])
  side: Side;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  fiat?: string = 'usd';
}

export class LinkDto {
  @IsEnum(['buy', 'sell'])
  side: Side;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  fiat?: string = 'usd';

  @IsOptional()
  @IsString()
  wallet?: string;
}

export interface CurrencyItem {
  code: string;
  name: string;
  symbol: string;
  network: string;
  chainLabel: string;
  sellSupported: boolean;
}

export interface CurrencyGroup {
  network: string;
  label: string;
  currencies: CurrencyItem[];
}

export interface CurrenciesResponseDto {
  side: Side;
  count: number;
  groups: CurrencyGroup[];
}

export interface QuoteResponseDto {
  side: Side;
  currencyCode: string;
  fiatCode: string;
  inputAmount: number;
  outputAmount: number;
  feeAmount: number;
  networkFeeAmount: number;
  totalAmount: number;
}

export interface LinkResponseDto {
  url: string;
  externalTransactionId: string;
}

export interface HealthResponseDto {
  publishableKeyPrefix: string;
  secretConfigured: boolean;
  webhookSecretConfigured: boolean;
  buyWidgetHost: string;
  sellWidgetHost: string;
}

export interface WebhookResponseDto {
  received: boolean;
}
