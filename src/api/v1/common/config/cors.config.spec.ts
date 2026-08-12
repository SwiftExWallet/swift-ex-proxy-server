import { createCorsOptions, getAllowedCorsOrigins } from './cors.config';

function invokeOriginCallback(
  options: ReturnType<typeof createCorsOptions>,
  origin?: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const originHandler = options.origin;

    if (typeof originHandler !== 'function') {
      reject(new Error('CORS origin handler is not configured'));
      return;
    }

    (
      originHandler as (
        origin: string | undefined,
        callback: (error: Error | null, allowed?: boolean) => void,
      ) => void
    )(origin, (error, allowed) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(Boolean(allowed));
    });
  });
}

describe('CORS configuration', () => {
  it('allows requests without an Origin header for native mobile and server clients', async () => {
    const options = createCorsOptions({ NODE_ENV: 'production' });

    await expect(invokeOriginCallback(options)).resolves.toBe(true);
  });

  it('allows exact configured HTTPS browser origins', async () => {
    const options = createCorsOptions({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    });

    await expect(
      invokeOriginCallback(options, 'https://app.example.com'),
    ).resolves.toBe(true);
  });

  it('rejects origins that are not allowlisted', async () => {
    const options = createCorsOptions({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    });

    await expect(
      invokeOriginCallback(options, 'https://evil.example.com'),
    ).rejects.toThrow('CORS origin not allowed');
  });

  it('does not allow non-HTTPS browser origins in production', () => {
    const allowedOrigins = getAllowedCorsOrigins({
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'http://app.example.com,https://app.example.com',
    });

    expect(allowedOrigins.has('http://app.example.com')).toBe(false);
    expect(allowedOrigins.has('https://app.example.com')).toBe(true);
  });

  it('allows explicitly configured mobile WebView origins', async () => {
    const options = createCorsOptions({
      NODE_ENV: 'production',
      CORS_ALLOWED_WEBVIEW_ORIGINS: 'capacitor://localhost',
    });

    await expect(
      invokeOriginCallback(options, 'capacitor://localhost'),
    ).resolves.toBe(true);
  });

  it('allows wallet auth token headers', () => {
    const options = createCorsOptions();

    expect(options.allowedHeaders).toEqual(
      expect.arrayContaining(['x-auth-wallet-token']),
    );
  });
});
