import * as crypto from 'crypto';
import 'dotenv/config';

export const PUBLISHABLE_KEY = process.env.MOON_PAY_PUBLISHABLE_KEY ?? '';
export const SECRET_KEY = process.env.MOON_PAY_SECRET_KEY ?? '';
export const WEBHOOK_KEY = process.env.MOON_PAY_WEBHOOK_KEY ?? '';

export const API_BASE = process.env.MOON_PAY_BASE ?? '';
export const BUY_WIDGET = process.env.MOON_PAY_BUY_WIDGET ?? '';
export const SELL_WIDGET = process.env.MOON_PAY_SELL_WIDGET ?? '';

export type Side = 'buy' | 'sell';

export type Currency = {
  code: string;
  name: string;
  symbol: string;
  network: string;
  chainLabel: string;
  sellSupported: boolean;
};

export type QuoteResult = {
  side: Side;
  currencyCode: string;
  fiatCode: string;
  inputAmount: number;
  outputAmount: number;
  feeAmount: number;
  networkFeeAmount: number;
  totalAmount: number;
};

export const NETWORK_LABELS: Record<string, string> = {
  ethereum: 'Ethereum',
  binance_smart_chain: 'BNB Smart Chain',
  polygon: 'Polygon',
  avalanche_c_chain: 'Avalanche C-Chain',
  optimism: 'Optimism',
  arbitrum: 'Arbitrum',
  base: 'Base',
  stellar: 'Stellar',
};

export const NETWORK_ORDER = Object.keys(NETWORK_LABELS);

let _cache: { at: number; items: Currency[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

function tickerFromCode(code: string): string {
  return code.split('_')[0].toUpperCase();
}

export async function getCurrencies(): Promise<Currency[]> {
  if (_cache && Date.now() - _cache.at < CACHE_MS) return _cache.items;

  const res = await fetch(
    `${API_BASE}/v3/currencies?apiKey=${PUBLISHABLE_KEY}`,
  );
  if (!res.ok) throw new Error(`MoonPay currencies failed (${res.status})`);
  const raw: any[] = await res.json();

  const items: Currency[] = raw
    .filter((c) => c?.type === 'crypto' && !c?.isSuspended)
    .map((c) => {
      const network = c?.metadata?.networkCode ?? c?.networkCode ?? '';
      return {
        code: c.code as string,
        name: (c.name as string) ?? c.code,
        symbol: tickerFromCode(c.code),
        network,
        chainLabel: NETWORK_LABELS[network] ?? network,
        sellSupported: Boolean(c?.isSellSupported),
      };
    })
    .filter((c) => c.network in NETWORK_LABELS)
    .sort((a, b) => {
      const n =
        NETWORK_ORDER.indexOf(a.network) - NETWORK_ORDER.indexOf(b.network);
      return n !== 0 ? n : a.name.localeCompare(b.name);
    });

  _cache = { at: Date.now(), items };
  return items;
}

export async function isSupported(
  code: string,
  side: Side = 'buy',
): Promise<boolean> {
  const c = (await getCurrencies()).find((x) => x.code === code);
  if (!c) return false;
  return side === 'sell' ? c.sellSupported : true;
}

export async function getQuote(
  side: Side,
  currencyCode: string,
  amount: number,
  fiatCode = 'usd',
): Promise<QuoteResult> {
  const url = new URL(
    `${API_BASE}/v3/currencies/${currencyCode}/${side}_quote`,
  );
  url.searchParams.set('apiKey', PUBLISHABLE_KEY);

  if (side === 'buy') {
    url.searchParams.set('baseCurrencyCode', fiatCode);
    url.searchParams.set('baseCurrencyAmount', String(amount));
  } else {
    url.searchParams.set('quoteCurrencyCode', fiatCode);
    url.searchParams.set('baseCurrencyAmount', String(amount));
  }

  const res = await fetch(url.toString());
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.message ?? `MoonPay quote failed (${res.status})`);
  }

  return {
    side,
    currencyCode,
    fiatCode,
    inputAmount: amount,
    outputAmount: Number(body.quoteCurrencyAmount ?? 0),
    feeAmount: Number(body.feeAmount ?? 0),
    networkFeeAmount: Number(body.networkFeeAmount ?? 0),
    totalAmount: Number(body.totalAmount ?? 0),
  };
}

export function buildSignedWidgetUrl(opts: {
  side: Side;
  currencyCode: string;
  amount: number;
  fiatCode?: string;
  walletAddress?: string;
  externalTransactionId?: string;
}): string {
  const fiatCode = opts.fiatCode ?? 'usd';
  const base = opts.side === 'buy' ? BUY_WIDGET : SELL_WIDGET;
  const url = new URL(base);
  const p = url.searchParams;

  p.set('apiKey', PUBLISHABLE_KEY);

  if (opts.side === 'buy') {
    p.set('currencyCode', opts.currencyCode);
    p.set('baseCurrencyCode', fiatCode);
    p.set('baseCurrencyAmount', String(opts.amount));
    if (opts.walletAddress) p.set('walletAddress', opts.walletAddress);
  } else {
    p.set('baseCurrencyCode', opts.currencyCode);
    p.set('baseCurrencyAmount', String(opts.amount));
    p.set('quoteCurrencyCode', fiatCode);
  }

  if (opts.externalTransactionId) {
    p.set('externalTransactionId', opts.externalTransactionId);
  }

  p.sort();
  p.set('signature', signUrlSearch(url.search));

  return url.toString();
}

export function signUrlSearch(search: string): string {
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(search)
    .digest('base64');
}

export function verifyWebhook(rawBody: string, header: string | null): boolean {
  if (!header || !WEBHOOK_KEY) return false;

  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k.trim(), (v ?? '').trim()];
    }),
  );

  const { t, s } = parts;
  if (!t || !s) return false;

  const expected = crypto
    .createHmac('sha256', WEBHOOK_KEY)
    .update(`${t}.${rawBody}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected));
  } catch {
    return false;
  }
}
