import 'reflect-metadata';
import {
  RATE_LIMIT_KEY,
  RateLimit,
  RateLimitConfig,
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
});
