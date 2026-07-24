import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_KEY,
  RateLimitConfig,
} from '../decorators/rate-limit.decorator';
import { createRedisClient } from '../config/datastore.config';
import { RateLimitGuard } from './rate-limit.guard';

const mockRedisConsume = jest.fn();

jest.mock('rate-limiter-flexible', () => {
  const actual = jest.requireActual('rate-limiter-flexible');
  return {
    ...actual,
    RateLimiterRedis: jest.fn().mockImplementation(() => ({
      consume: mockRedisConsume,
    })),
  };
});

jest.mock('../config/datastore.config', () => ({
  createRedisClient: jest.fn(() => ({})),
}));

describe('RateLimitGuard', () => {
  const originalEnv = process.env;
  const mockCreateRedisClient = createRedisClient as jest.Mock;
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RateLimitGuard;

  beforeEach(() => {
    process.env = { ...originalEnv, ENVIRONMENT: 'dev' };
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RateLimitGuard(reflector as unknown as Reflector);
    mockRedisConsume.mockReset();
    mockCreateRedisClient.mockReset();
    mockCreateRedisClient.mockReturnValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  function createContext(request: any): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  function useLimits(configs: RateLimitConfig[]): void {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === RATE_LIMIT_KEY ? configs : undefined,
    );
  }

  it('limits by device independently from IP when keyBy is device', async () => {
    useLimits([
      {
        points: 1,
        duration: 60,
        key: 'device-test',
        keyBy: 'device',
      },
    ]);

    await expect(
      guard.canActivate(
        createContext({ ip: '127.0.0.1', device: { _id: 'device-a' } }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        createContext({ ip: '127.0.0.1', device: { _id: 'device-b' } }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        createContext({ ip: '127.0.0.1', device: { _id: 'device-a' } }),
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('limits by wallet independently from IP when keyBy is wallet', async () => {
    useLimits([
      {
        points: 1,
        duration: 60,
        key: 'wallet-test',
        keyBy: 'wallet',
      },
    ]);

    await expect(
      guard.canActivate(
        createContext({
          ip: '127.0.0.1',
          wallet: { address: '0x1111111111111111111111111111111111111111' },
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        createContext({
          ip: '127.0.0.1',
          wallet: { address: '0x2222222222222222222222222222222222222222' },
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        createContext({
          ip: '127.0.0.1',
          wallet: { address: '0x1111111111111111111111111111111111111111' },
        }),
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('requires device context for device keyed limits', async () => {
    useLimits([
      {
        points: 1,
        duration: 60,
        key: 'missing-device-test',
        keyBy: 'device',
      },
    ]);

    await expect(
      guard.canActivate(createContext({ ip: '127.0.0.1' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires wallet context for wallet keyed limits', async () => {
    useLimits([
      {
        points: 1,
        duration: 60,
        key: 'missing-wallet-test',
        keyBy: 'wallet',
      },
    ]);

    await expect(
      guard.canActivate(createContext({ ip: '127.0.0.1' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('global fallback limits by available IP, device, and wallet contexts', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const request = {
      ip: '10.0.0.1',
      device: { _id: 'device-a' },
      wallet: { address: '0x1111111111111111111111111111111111111111' },
    };

    for (let i = 0; i < 100; i += 1) {
      await expect(guard.canActivate(createContext(request))).resolves.toBe(
        true,
      );
    }

    await expect(
      guard.canActivate(
        createContext({
          ip: '10.0.0.2',
          device: { _id: 'device-a' },
          wallet: { address: '0x2222222222222222222222222222222222222222' },
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ limit: 'global-device' }),
    });

    await expect(
      guard.canActivate(
        createContext({
          ip: '10.0.0.3',
          device: { _id: 'device-b' },
          wallet: { address: '0x1111111111111111111111111111111111111111' },
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ limit: 'global-wallet' }),
    });
  });

  it('uses memory fallback when Redis-backed limiter fails', async () => {
    process.env = { ...originalEnv, ENVIRONMENT: 'test' };
    guard = new RateLimitGuard(reflector as unknown as Reflector);
    mockRedisConsume.mockRejectedValue(new Error('ECONNRESET'));
    useLimits([
      {
        points: 10,
        duration: 60,
        key: 'redis-fallback-test',
        keyBy: 'ip',
        fallbackPoints: 1,
        redisFailurePolicy: 'fallback-memory',
      },
    ]);

    await expect(
      guard.canActivate(createContext({ ip: '127.0.0.1' })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(createContext({ ip: '127.0.0.1' })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        limit: 'redis-fallback-test',
      }),
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('uses memory fallback when Redis limiter creation fails', async () => {
    process.env = { ...originalEnv, ENVIRONMENT: 'test' };
    guard = new RateLimitGuard(reflector as unknown as Reflector);
    mockCreateRedisClient.mockImplementationOnce(() => {
      throw new Error('missing redis');
    });
    useLimits([
      {
        points: 10,
        duration: 60,
        key: 'redis-create-fallback-test',
        keyBy: 'ip',
        fallbackPoints: 1,
        redisFailurePolicy: 'fallback-memory',
      },
    ]);

    await expect(
      guard.canActivate(createContext({ ip: '127.0.0.1' })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(createContext({ ip: '127.0.0.1' })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        limit: 'redis-create-fallback-test',
      }),
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('fails closed when Redis-backed limiter fails and route requires Redis', async () => {
    process.env = { ...originalEnv, ENVIRONMENT: 'test' };
    guard = new RateLimitGuard(reflector as unknown as Reflector);
    mockRedisConsume.mockRejectedValue(new Error('ECONNRESET'));
    useLimits([
      {
        points: 10,
        duration: 60,
        key: 'redis-fail-closed-test',
        keyBy: 'ip',
        redisFailurePolicy: 'fail-closed',
      },
    ]);

    await expect(
      guard.canActivate(createContext({ ip: '127.0.0.1' })),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Rate limit service unavailable',
        limit: 'redis-fail-closed-test',
      }),
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });

  it('fails open when Redis-backed limiter fails and route allows it', async () => {
    process.env = { ...originalEnv, ENVIRONMENT: 'test' };
    guard = new RateLimitGuard(reflector as unknown as Reflector);
    mockRedisConsume.mockRejectedValue(new Error('ECONNRESET'));
    useLimits([
      {
        points: 1,
        duration: 60,
        key: 'redis-fail-open-test',
        keyBy: 'ip',
        redisFailurePolicy: 'fail-open',
        fallbackPoints: 1,
      },
    ]);

    await expect(
      guard.canActivate(createContext({ ip: '127.0.0.1' })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(createContext({ ip: '127.0.0.1' })),
    ).resolves.toBe(true);
  });
});
