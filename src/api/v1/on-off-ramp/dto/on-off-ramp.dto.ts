import {
  Equals,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  NotEquals,
  ValidateIf,
} from 'class-validator';
import { Side } from '../moonpay/dto/moonpay.dto';
import { OnOffRampProvider } from '../on-off-ramp-provider.enum';

const BUY_SELL = ['buy', 'sell'];

type RampPayload = {
  provider?: OnOffRampProvider;
  side?: Side;
  code?: string;
  crypto?: string;
  network?: string;
  blockchain?: string;
};

function isAlchemyProvider(provider?: OnOffRampProvider) {
  return (
    provider === OnOffRampProvider.ALCHEMY ||
    provider === OnOffRampProvider.ALCHEMY_PAY
  );
}

function isBanxaProvider(provider?: OnOffRampProvider) {
  return provider === OnOffRampProvider.BANXA;
}

function isMoonPayProvider(provider?: OnOffRampProvider) {
  return provider === OnOffRampProvider.MOONPAY;
}

export class OnOffRampQuotePayloadDto {
  @IsEnum(OnOffRampProvider)
  @IsNotEmpty()
  provider: OnOffRampProvider;

  @IsIn(BUY_SELL)
  side: Side;

  @ValidateIf((payload: RampPayload) => isBanxaProvider(payload.provider))
  @IsString()
  @IsNotEmpty()
  paymentMethodId?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      !isMoonPayProvider(payload.provider) ||
      (isMoonPayProvider(payload.provider) && !payload.code),
  )
  @IsString()
  @IsNotEmpty()
  crypto?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      isAlchemyProvider(payload.provider) ||
      (isBanxaProvider(payload.provider) && !payload.blockchain),
  )
  @IsString()
  @IsNotEmpty()
  network?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      isBanxaProvider(payload.provider) && !payload.network,
  )
  @IsString()
  @IsNotEmpty()
  blockchain?: string;

  @ValidateIf((payload: RampPayload) => !isMoonPayProvider(payload.provider))
  @IsString()
  @IsNotEmpty()
  fiat?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      isAlchemyProvider(payload.provider) ||
      isMoonPayProvider(payload.provider),
  )
  @IsNotEmpty()
  amount?: unknown;

  @ValidateIf(
    (payload: RampPayload) =>
      isMoonPayProvider(payload.provider) && !payload.crypto,
  )
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsString()
  cryptoAmount?: string;

  @IsOptional()
  @IsString()
  fiatAmount?: string;
}

export class OnOffRampOrderPayloadDto {
  @IsEnum(OnOffRampProvider)
  @NotEquals(OnOffRampProvider.MOONPAY)
  provider: OnOffRampProvider;

  @IsIn(BUY_SELL)
  side?: Side;

  @ValidateIf(
    (payload: RampPayload) =>
      isAlchemyProvider(payload.provider) && payload.side === 'buy',
  )
  @IsString()
  @IsNotEmpty()
  amount?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      isAlchemyProvider(payload.provider) && payload.side === 'buy',
  )
  @IsString()
  @IsNotEmpty()
  fiatCurrency?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      isAlchemyProvider(payload.provider) && payload.side === 'buy',
  )
  @IsString()
  @IsNotEmpty()
  cryptoCurrency?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @ValidateIf((payload: RampPayload) => isAlchemyProvider(payload.provider))
  @IsString()
  @IsNotEmpty()
  network?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      isAlchemyProvider(payload.provider) && payload.side === 'buy',
  )
  @IsString()
  @IsNotEmpty()
  payWayCode?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      (isAlchemyProvider(payload.provider) && payload.side === 'sell') ||
      isBanxaProvider(payload.provider),
  )
  @IsString()
  @IsNotEmpty()
  crypto?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      isAlchemyProvider(payload.provider) && payload.side === 'sell',
  )
  @IsString()
  @IsNotEmpty()
  cryptoAmount?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      (isAlchemyProvider(payload.provider) && payload.side === 'sell') ||
      isBanxaProvider(payload.provider),
  )
  @IsString()
  @IsNotEmpty()
  fiat?: string;

  @ValidateIf(
    (payload: RampPayload) =>
      isAlchemyProvider(payload.provider) && payload.side === 'sell',
  )
  @IsString()
  @IsNotEmpty()
  country?: string;

  @ValidateIf((payload: RampPayload) => isBanxaProvider(payload.provider))
  @IsString()
  @IsNotEmpty()
  paymentMethodId?: string;

  @ValidateIf((payload: RampPayload) => isBanxaProvider(payload.provider))
  @IsString()
  @IsNotEmpty()
  blockchain?: string;

  @IsOptional()
  @IsString()
  fiatAmount?: string;

  @ValidateIf((payload: RampPayload) => isBanxaProvider(payload.provider))
  @IsString()
  @IsNotEmpty()
  walletAddress?: string;
}

export class OnOffRampAssetsQueryDto {
  @IsEnum(OnOffRampProvider)
  @NotEquals(OnOffRampProvider.ALCHEMY)
  provider: OnOffRampProvider;

  @IsOptional()
  @IsIn(BUY_SELL)
  side?: Side;

  @IsOptional()
  @IsIn(BUY_SELL)
  orderType?: Side;
}

export class OnOffRampLinkPayloadDto {
  @IsEnum(OnOffRampProvider)
  @Equals(OnOffRampProvider.MOONPAY)
  provider: OnOffRampProvider;

  @IsIn(BUY_SELL)
  side?: Side;

  @ValidateIf((payload: RampPayload) => !payload.crypto)
  @IsString()
  @IsNotEmpty()
  code?: string;

  @ValidateIf((payload: RampPayload) => !payload.code)
  @IsString()
  @IsNotEmpty()
  crypto?: string;

  @IsNotEmpty()
  amount?: unknown;

  @IsOptional()
  @IsString()
  fiat?: string;

  @IsOptional()
  @IsString()
  wallet?: string;
}
