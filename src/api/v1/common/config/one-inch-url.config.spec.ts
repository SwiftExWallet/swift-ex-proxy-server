import { resolveOneInchUrls } from './one-inch-url.config';

describe('resolveOneInchUrls', () => {
  it('derives every development URL from the single mock origin', () => {
    const urls = resolveOneInchUrls({
      ENVIRONMENT: 'dev',
      INCH_MOCK_BASE_URL: 'http://localhost:4010/',
    });

    expect(urls).toEqual({
      fusionSdk: 'http://localhost:4010/fusion',
      fusionPlusSdk: 'http://localhost:4010/fusion-plus',
      quoter: 'http://localhost:4010/fusion/quoter/v2.0',
      fusionPlusQuoter: 'http://localhost:4010/fusion-plus/v1.2',
      relayer: 'http://localhost:4010/fusion/relayer/v2.0',
      fusionPlusRelayer: 'http://localhost:4010/fusion-plus/v1.2',
      orders: 'http://localhost:4010/fusion/orders/v2.0',
      fusionPlusOrders: 'http://localhost:4010/fusion-plus/v1.2/order/status',
    });
  });

  it('ignores the mock origin outside development', () => {
    const urls = resolveOneInchUrls({
      ENVIRONMENT: 'production',
      INCH_MOCK_BASE_URL: 'http://localhost:4010',
      QUOTER_BASE: 'https://api.1inch.com/fusion/quoter/v2.0',
      FUSION_PLUS_QUOTER_BASE: 'https://api.1inch.com/fusion-plus/quoter/v1.2',
      INCH_RELAYER_BASE: 'https://api.1inch.com/fusion/relayer/v2.0',
      FUSION_PLUS_RELAYER_BASE: 'https://api.1inch.com/fusion-plus/relayer/v1.2',
      INCH_ORDER_BASE: 'https://api.1inch.com/fusion/orders/v2.0',
      FUSION_PLUS_ORDER_BASE: 'https://api.1inch.com/fusion-plus/orders/v1.2',
    });

    expect(Object.values(urls).some((url) => url.includes('localhost'))).toBe(false);
    expect(urls.fusionSdk).toBe('https://api.1inch.com/fusion');
    expect(urls.fusionPlusSdk).toBe('https://api.1inch.com/fusion-plus');
  });

  it('rejects a missing development mock URL', () => {
    expect(() => resolveOneInchUrls({ ENVIRONMENT: 'dev' })).toThrow(
      'INCH_MOCK_BASE_URL is required when ENVIRONMENT=dev',
    );
  });
});
