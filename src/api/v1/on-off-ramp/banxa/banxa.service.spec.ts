import { BanxaService } from './banxa.service';
import { HttpRequestMethod } from '../../common/enums/httpRequest.enum';

describe('BanxaService', () => {
  const originalEnv = process.env;
  let httpService: { request: jest.Mock; get: jest.Mock };
  let service: BanxaService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BANXA_API_KEY: 'banxa-key',
      BANXA_BASE_URL: 'https://banxa.example/',
      BANXA_REDIRECT_URL: 'https://app.example/banxa',
    };
    httpService = {
      request: jest.fn().mockResolvedValue({ status: true }),
      get: jest.fn(),
    };
    service = new BanxaService(httpService as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates orders without a device by generating external ids', async () => {
    await service.buyOrderCreate(
      {
        paymentMethodId: 'card',
        crypto: 'USDC',
        blockchain: 'ETH',
        fiat: 'USD',
        fiatAmount: '100',
        walletAddress: '0xwallet',
      } as any,
      undefined,
    );

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: HttpRequestMethod.POST,
        url: 'https://banxa.example/v2/buy',
        body: expect.objectContaining({
          externalOrderId: expect.any(String),
          externalCustomerId: expect.any(String),
          redirectUrl: 'https://app.example/banxa',
        }),
      }),
    );
  });
});
