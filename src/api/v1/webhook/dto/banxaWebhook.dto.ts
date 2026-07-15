import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const MAX_BANXA_FIELD_LENGTH = 128;

export class BanxaWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BANXA_FIELD_LENGTH)
  external_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BANXA_FIELD_LENGTH)
  status: string;

  @IsString()
  @IsIn(['BUY', 'SELL'])
  order_type: 'BUY' | 'SELL';

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BANXA_FIELD_LENGTH)
  crypto_coin: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BANXA_FIELD_LENGTH)
  crypto_blockchain: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BANXA_FIELD_LENGTH)
  crypto_amount: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BANXA_FIELD_LENGTH)
  fiat_currency: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BANXA_FIELD_LENGTH)
  fiat_amount: string;
}
