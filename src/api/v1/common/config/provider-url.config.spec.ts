import {
  getBlockscoutAllowedHosts,
  getProviderRpcAllowedHosts,
  validateProviderUrl,
} from './provider-url.config';

describe('provider-url config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ENVIRONMENT: 'prod',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('allows https URLs for exact allowlisted hosts', () => {
    expect(
      validateProviderUrl('https://api.1inch.dev/swap/v6.0/', {
        source: 'QUOTER_BASE',
        allowedHosts: ['api.1inch.dev'],
      }),
    ).toBe('https://api.1inch.dev/swap/v6.0');
  });

  it('does not alter query string values while normalizing paths', () => {
    expect(
      validateProviderUrl('https://rpc.example/rpc/?token=abc/', {
        source: 'PROVIDER_RPC_ETH',
        allowedHosts: ['rpc.example'],
      }),
    ).toBe('https://rpc.example/rpc?token=abc/');
  });

  it('rejects non-allowlisted hosts', () => {
    expect(() =>
      validateProviderUrl('https://evil.example/swap/v6.0', {
        source: 'QUOTER_BASE',
        allowedHosts: ['api.1inch.dev'],
      }),
    ).toThrow('QUOTER_BASE host is not allowlisted');
  });

  it('rejects http URLs outside dev', () => {
    expect(() =>
      validateProviderUrl('http://api.1inch.dev/swap/v6.0', {
        source: 'QUOTER_BASE',
        allowedHosts: ['api.1inch.dev'],
      }),
    ).toThrow('QUOTER_BASE must use https outside dev');
  });

  it('rejects private and local hosts outside dev', () => {
    for (const url of [
      'https://localhost/rpc',
      'https://127.0.0.1/rpc',
      'https://10.0.0.1/rpc',
      'https://service.internal/rpc',
    ]) {
      expect(() =>
        validateProviderUrl(url, {
          source: 'PROVIDER_RPC_ETH',
          allowedHosts: [new URL(url).hostname],
        }),
      ).toThrow('PROVIDER_RPC_ETH host is not allowed outside dev');
    }
  });

  it('requires an allowlist outside dev for configured provider URLs', () => {
    expect(() =>
      validateProviderUrl('https://rpc.example/rpc', {
        source: 'PROVIDER_RPC_ETH',
        allowedHosts: [],
      }),
    ).toThrow('PROVIDER_RPC_ETH requires an allowed host list');
  });

  it('allows local URLs in dev without a host allowlist', () => {
    process.env.ENVIRONMENT = 'dev';

    expect(
      validateProviderUrl('http://localhost:8545', {
        source: 'PROVIDER_RPC_ETH',
        allowedHosts: [],
      }),
    ).toBe('http://localhost:8545');
  });

  it('parses RPC and Blockscout allowlist env vars', () => {
    process.env.PROVIDER_RPC_ALLOWED_HOSTS = 'rpc.one.example, rpc.two.example';
    process.env.BLOCKSCOUT_ALLOWED_HOSTS = 'eth.blockscout.example';

    expect(getProviderRpcAllowedHosts()).toEqual([
      'rpc.one.example',
      'rpc.two.example',
    ]);
    expect(getBlockscoutAllowedHosts()).toEqual(['eth.blockscout.example']);
  });
});
