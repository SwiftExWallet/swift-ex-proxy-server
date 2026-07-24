import 'reflect-metadata';
import {
  RATE_LIMIT_KEY,
  RateLimit,
  RateLimitConfig,
  failClosedRateLimits,
  rateLimitByIpAndDevice,
  rateLimitByIpDeviceAndWallet,
} from './rate-limit.decorator';

describe('RateLimit decorator', () => {
  it('stores rate limit metadata on the decorated method', () => {
    const limit: RateLimitConfig = {
      points: 10,
      duration: 60,
      key: 'test-limit',
      keyBy: 'ip',
    };

    class TestController {
      @RateLimit(limit)
      handler() {
        return undefined;
      }
    }

    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, TestController.prototype.handler),
    ).toEqual([limit]);
  });

  it('preserves multiple rate limit configs in order', () => {
    const limits: RateLimitConfig[] = [
      { points: 60, duration: 60, key: 'ip-limit', keyBy: 'ip' },
      { points: 30, duration: 60, key: 'device-limit', keyBy: 'device' },
      { points: 15, duration: 60, key: 'wallet-limit', keyBy: 'wallet' },
    ];

    class TestController {
      @RateLimit(...limits)
      handler() {
        return undefined;
      }
    }

    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, TestController.prototype.handler),
    ).toEqual(limits);
  });

  it('stores keyBy values unchanged', () => {
    class TestController {
      @RateLimit(
        { points: 1, duration: 1, keyBy: 'ip' },
        { points: 2, duration: 2, keyBy: 'device' },
        { points: 3, duration: 3, keyBy: 'wallet' },
      )
      handler() {
        return undefined;
      }
    }

    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, TestController.prototype.handler),
    ).toEqual([
      { points: 1, duration: 1, keyBy: 'ip' },
      { points: 2, duration: 2, keyBy: 'device' },
      { points: 3, duration: 3, keyBy: 'wallet' },
    ]);
  });

  it('stores redis outage policy and fallback points unchanged', () => {
    const limit: RateLimitConfig = {
      points: 10,
      duration: 60,
      key: 'redis-policy-test',
      keyBy: 'wallet',
      redisFailurePolicy: 'fail-closed',
      fallbackPoints: 2,
    };

    class TestController {
      @RateLimit(limit)
      handler() {
        return undefined;
      }
    }

    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, TestController.prototype.handler),
    ).toEqual([limit]);
  });

  it('stores an empty array when called without configs', () => {
    class TestController {
      @RateLimit()
      handler() {
        return undefined;
      }
    }

    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, TestController.prototype.handler),
    ).toEqual([]);
  });

  it('creates IP and device scoped limits', () => {
    expect(
      rateLimitByIpAndDevice('submit-flow', { ip: 20, device: 10 }),
    ).toEqual([
      { points: 20, duration: 60, key: 'submit-flow-ip', keyBy: 'ip' },
      {
        points: 10,
        duration: 60,
        key: 'submit-flow-device',
        keyBy: 'device',
      },
    ]);
  });

  it('creates IP, device, and wallet scoped limits', () => {
    expect(
      rateLimitByIpDeviceAndWallet(
        'broadcast-flow',
        {
          ip: 20,
          device: 10,
          wallet: 10,
        },
        120,
      ),
    ).toEqual([
      { points: 20, duration: 120, key: 'broadcast-flow-ip', keyBy: 'ip' },
      {
        points: 10,
        duration: 120,
        key: 'broadcast-flow-device',
        keyBy: 'device',
      },
      {
        points: 10,
        duration: 120,
        key: 'broadcast-flow-wallet',
        keyBy: 'wallet',
      },
    ]);
  });

  it('marks rate limit configs as fail closed', () => {
    expect(
      failClosedRateLimits([
        { points: 1, duration: 60, key: 'ip-limit', keyBy: 'ip' },
        { points: 2, duration: 60, key: 'wallet-limit', keyBy: 'wallet' },
      ]),
    ).toEqual([
      {
        points: 1,
        duration: 60,
        key: 'ip-limit',
        keyBy: 'ip',
        redisFailurePolicy: 'fail-closed',
      },
      {
        points: 2,
        duration: 60,
        key: 'wallet-limit',
        keyBy: 'wallet',
        redisFailurePolicy: 'fail-closed',
      },
    ]);
  });
});
