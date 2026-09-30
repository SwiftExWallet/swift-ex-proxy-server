import {
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

export class SoroswapQuoteDto {
  @IsString()
  @IsNotEmpty()
  assetIn: string;

  @IsString()
  @IsNotEmpty()
  assetOut: string;

  @IsString()
  @Matches(/^\d+(\.\d+)?$/)
  amount: string;
}

export class BroadcastSoroswapDto {
  @IsString()
  @IsNotEmpty()
  signedXdr: string;
}