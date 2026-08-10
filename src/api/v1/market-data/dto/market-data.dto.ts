import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsDate,
  ValidateNested,
  IsObject,
} from 'class-validator';

class RoiDto {
  @IsOptional()
  @IsNumber()
  times?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  percentage?: number;
}

export class MarketDataDto {
  @IsString()
  id: string;

  @IsString()
  symbol: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsNumber()
  current_price?: number;

  @IsOptional()
  @IsNumber()
  market_cap?: number;

  @IsOptional()
  @IsNumber()
  market_cap_rank?: number;

  @IsOptional()
  @IsNumber()
  fully_diluted_valuation?: number;

  @IsOptional()
  @IsNumber()
  total_volume?: number;

  @IsOptional()
  @IsNumber()
  high_24h?: number;

  @IsOptional()
  @IsNumber()
  low_24h?: number;

  @IsOptional()
  @IsNumber()
  price_change_24h?: number;

  @IsOptional()
  @IsNumber()
  price_change_percentage_24h?: number;

  @IsOptional()
  @IsNumber()
  market_cap_change_24h?: number;

  @IsOptional()
  @IsNumber()
  market_cap_change_percentage_24h?: number;

  @IsOptional()
  @IsNumber()
  circulating_supply?: number;

  @IsOptional()
  @IsNumber()
  total_supply?: number;

  @IsOptional()
  @IsNumber()
  max_supply?: number;

  @IsOptional()
  @IsNumber()
  ath?: number;

  @IsOptional()
  @IsNumber()
  ath_change_percentage?: number;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  ath_date?: Date;

  @IsOptional()
  @IsNumber()
  atl?: number;

  @IsOptional()
  @IsNumber()
  atl_change_percentage?: number;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  atl_date?: Date;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RoiDto)
  roi?: RoiDto;

  @IsDate()
  @Type(() => Date)
  last_updated: Date;
}
