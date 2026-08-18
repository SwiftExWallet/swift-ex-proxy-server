import { MoonPayService } from './moonpay.service';
import { buildSignedWidgetUrl, isSupported } from './lib/moonpay.lib';

jest.mock('./lib/moonpay.lib', () => ({
  buildSignedWidgetUrl: jest.fn().mockReturnValue('https://moonpay.example'),
  getCurrencies: jest.fn(),
  getQuote: jest.fn(),
  isSupported: jest.fn(),
  NETWORK_LABELS: {},
  NETWORK_ORDER: [],
}));

describe('MoonPayService', () => {
  it('builds links without a device by generating an external transaction id', async () => {
    (isSupported as jest.Mock).mockResolvedValue(true);

    await expect(
      new MoonPayService().buildLink(
        {
          side: 'buy',
          code: 'usdc',
          amount: 10,
          fiat: 'usd',
          wallet: '0xwallet',
        },
        undefined,
      ),
    ).resolves.toEqual({
      url: 'https://moonpay.example',
      externalTransactionId: expect.any(String),
    });

    expect(buildSignedWidgetUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        externalTransactionId: expect.any(String),
      }),
    );
  });
});
