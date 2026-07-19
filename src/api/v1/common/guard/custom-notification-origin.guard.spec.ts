import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CustomNotificationOriginGuard } from './custom-notification-origin.guard';

describe('CustomNotificationOriginGuard', () => {
  let guard: CustomNotificationOriginGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    guard = new CustomNotificationOriginGuard();
    process.env = { ...originalEnv };
    delete process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS;
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function contextWithOrigin(origin?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: origin === undefined ? {} : { origin },
        }),
      }),
    } as ExecutionContext;
  }

  it('allows configured custom notification origins', () => {
    process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS = 'https://app.example.com';

    expect(
      guard.canActivate(contextWithOrigin('https://app.example.com')),
    ).toBe(true);
  });

  it('falls back to CORS browser origins when no route-specific origins are set', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';

    expect(
      guard.canActivate(contextWithOrigin('https://app.example.com')),
    ).toBe(true);
  });

  it('rejects missing origin headers', () => {
    process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS = 'https://app.example.com';

    expect(() => guard.canActivate(contextWithOrigin())).toThrow(
      ForbiddenException,
    );
  });

  it('rejects unconfigured origins', () => {
    process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS = 'https://app.example.com';

    expect(() =>
      guard.canActivate(contextWithOrigin('https://evil.example.com')),
    ).toThrow(ForbiddenException);
  });

  it('does not allow non-local http origins in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS = 'http://app.example.com';

    expect(() =>
      guard.canActivate(contextWithOrigin('http://app.example.com')),
    ).toThrow(ForbiddenException);
  });
});
