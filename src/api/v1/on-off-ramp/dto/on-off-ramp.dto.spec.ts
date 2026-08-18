import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { OnOffRampProvider } from '../on-off-ramp-provider.enum';
import {
  OnOffRampAssetsQueryDto,
  OnOffRampLinkPayloadDto,
  OnOffRampOrderPayloadDto,
  OnOffRampQuotePayloadDto,
} from './on-off-ramp.dto';

function validate(dto: new () => object, payload: Record<string, unknown>) {
  return validateSync(plainToInstance(dto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('On/off-ramp DTOs', () => {
  it('accepts provider in quote payload', () => {
    expect(
      validate(OnOffRampQuotePayloadDto, {
        provider: OnOffRampProvider.ALCHEMY,
        side: 'buy',
        crypto: 'USDC',
        network: 'ETH',
        fiat: 'USD',
        amount: '100',
      }),
    ).toHaveLength(0);
  });

  it('rejects quote payload without provider', () => {
    expect(
      validate(OnOffRampQuotePayloadDto, {
        side: 'buy',
        crypto: 'USDC',
        network: 'ETH',
        fiat: 'USD',
        amount: '100',
      }),
    ).not.toHaveLength(0);
  });

  it('rejects MoonPay order payloads', () => {
    expect(
      validate(OnOffRampOrderPayloadDto, {
        provider: OnOffRampProvider.MOONPAY,
        side: 'buy',
      }),
    ).not.toHaveLength(0);
  });

  it('rejects non-MoonPay link payloads', () => {
    expect(
      validate(OnOffRampLinkPayloadDto, {
        provider: OnOffRampProvider.BANXA,
        side: 'buy',
      }),
    ).not.toHaveLength(0);
  });

  it('rejects Alchemy assets queries', () => {
    expect(
      validate(OnOffRampAssetsQueryDto, {
        provider: OnOffRampProvider.ALCHEMY,
      }),
    ).not.toHaveLength(0);
  });
});
