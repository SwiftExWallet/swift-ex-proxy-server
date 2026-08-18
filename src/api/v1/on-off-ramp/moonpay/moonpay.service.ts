import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  buildSignedWidgetUrl,
  getCurrencies,
  getQuote,
  isSupported,
  NETWORK_LABELS,
  NETWORK_ORDER,
} from './lib/moonpay.lib';
import type { LinkDto, Side } from './dto/moonpay.dto';
import { Device } from '../../device/schema/device.schema';

@Injectable()
export class MoonPayService {
  async getCurrencies(side: Side = 'buy') {
    try {
      let items = await getCurrencies();
      if (side === 'sell') items = items.filter((c) => c.sellSupported);

      const groups = NETWORK_ORDER.map((network) => ({
        network,
        label: NETWORK_LABELS[network],
        currencies: items.filter((c) => c.network === network),
      })).filter((g) => g.currencies.length > 0);

      return { side, groups, count: items.length };
    } catch (err: any) {
      throw new BadGatewayException(err?.message ?? 'currencies failed');
    }
  }

  async getQuote(side: Side, code: string, amount: number, fiat = 'usd') {
    if (!(await isSupported(code, side))) {
      throw new BadRequestException(`${code} is not supported for ${side}`);
    }

    try {
      return await getQuote(side, code, amount, fiat);
    } catch (err: any) {
      throw new BadGatewayException(err?.message ?? 'quote failed');
    }
  }

  async buildLink(opts: LinkDto, device?: Device) {
    if (!(await isSupported(opts.code, opts.side))) {
      throw new BadRequestException(
        `${opts.code} is not supported for ${opts.side}`,
      );
    }
    const externalTransactionId = this.getExternalTransactionId(device);
    try {
      const url = buildSignedWidgetUrl({
        side: opts.side,
        currencyCode: opts.code,
        amount: opts.amount,
        fiatCode: opts.fiat ?? 'usd',
        walletAddress: opts.wallet,
        externalTransactionId,
      });
      return { url, externalTransactionId };
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'link build failed');
    }
  }

  private getExternalTransactionId(device?: Device): string {
    const deviceId = device?._id as unknown;

    if (typeof deviceId === 'string') {
      return deviceId;
    }

    if (
      deviceId &&
      typeof deviceId === 'object' &&
      'toHexString' in deviceId &&
      typeof deviceId.toHexString === 'function'
    ) {
      return deviceId.toHexString();
    }

    return randomUUID();
  }
}
