import {
  ExecutionContext,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_KEY,
  RateLimitConfig,
} from '../decorators/rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  const originalEnv = process.env;
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RateLimitGuard;

  beforeEach(() => {
    process.env = { ...originalEnv, ENVIRONMENT: 'dev' };
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RateLimitGuard(reflector as unknown as Reflector);
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
});
