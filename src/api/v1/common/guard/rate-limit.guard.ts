import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RateLimiterAbstract,
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from 'rate-limiter-flexible';
import {
  RATE_LIMIT_KEY,
  RateLimitConfig,
  RateLimitKeyBy,
  RedisFailurePolicy,
} from '../decorators/rate-limit.decorator';
import { createRedisClient } from '../config/datastore.config';

interface ManagedRateLimiter {
  primary: RateLimiterAbstract | null;
  fallback: RateLimiterMemory;
}

const GLOBAL_RATE_LIMIT_POINTS = 100;
const GLOBAL_RATE_LIMIT_DURATION_SECONDS = 60;
const DEFAULT_REDIS_FAILURE_POLICY: RedisFailurePolicy = 'fallback-memory';
const DEFAULT_MEMORY_FALLBACK_RATIO = 0.2;
const DEFAULT_MEMORY_FALLBACK_MIN_POINTS = 1;

function createManagedLimiter(
  points: number,
  duration: number,
  keyPrefix: string,
  fallbackPoints = getFallbackPoints(points),
): ManagedRateLimiter {
  const fallback = new RateLimiterMemory({
    points: fallbackPoints,
    duration,
  });

  if (process.env.ENVIRONMENT === 'dev') {
    return {
      primary: new RateLimiterMemory({ points, duration }),
      fallback,
    };
  }

  try {
    const redisClient = createRedisClient({
      enableOfflineQueue: false,
    });

    return {
      primary: new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix,
        points,
        duration,
      }),
      fallback,
    };
  } catch {
    return {
      primary: null,
      fallback,
    };
  }
}

function getDefaultRedisFailurePolicy(): RedisFailurePolicy {
  const policy = process.env.RATE_LIMIT_REDIS_FAILURE_POLICY;
  if (
    policy === 'fail-open' ||
    policy === 'fail-closed' ||
    policy === 'fallback-memory'
  ) {
    return policy;
  }

  return DEFAULT_REDIS_FAILURE_POLICY;
}

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function getFallbackPoints(points: number, configuredPoints?: number): number {
  if (configuredPoints && Number.isFinite(configuredPoints)) {
    return Math.max(1, Math.floor(configuredPoints));
  }

  const ratio = Number(process.env.RATE_LIMIT_MEMORY_FALLBACK_RATIO);
  const fallbackRatio =
    Number.isFinite(ratio) && ratio > 0 && ratio <= 1
      ? ratio
      : DEFAULT_MEMORY_FALLBACK_RATIO;
  const minPoints = getPositiveIntegerEnv(
    'RATE_LIMIT_MEMORY_FALLBACK_MIN_POINTS',
    DEFAULT_MEMORY_FALLBACK_MIN_POINTS,
  );

  return Math.max(minPoints, Math.floor(points * fallbackRatio));
}

function isRateLimitExceeded(err: unknown): err is RateLimiterRes {
  return (
    typeof err === 'object' &&
    err !== null &&
    'msBeforeNext' in err &&
    typeof (err as RateLimiterRes).msBeforeNext === 'number'
  );
}

const routeLimiters = new Map<string, ManagedRateLimiter>();

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly reflector: Reflector) {}

  private readonly globalLimiters = new Map<
    RateLimitKeyBy,
    ManagedRateLimiter
  >();

  private getGlobalLimiter(keyBy: RateLimitKeyBy): ManagedRateLimiter {
    if (!this.globalLimiters.has(keyBy)) {
      this.globalLimiters.set(
        keyBy,
        createManagedLimiter(
          GLOBAL_RATE_LIMIT_POINTS,
          GLOBAL_RATE_LIMIT_DURATION_SECONDS,
          `rl_global_${keyBy}`,
        ),
      );
    }

    return this.globalLimiters.get(keyBy)!;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const configs = this.reflector.getAllAndOverride<RateLimitConfig[]>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();

    // no decorator → use global limiter
    if (!configs || configs.length === 0) {
      for (const keyBy of this.getGlobalKeyTypes(request)) {
        await this.consumeLimit(
          this.getGlobalLimiter(keyBy),
          this.getConsumeKey(request, keyBy),
          `global-${keyBy}`,
          getDefaultRedisFailurePolicy(),
        );
      }

      return true;
    }

    // ✅ run ALL limiters — all must pass
    for (const config of configs) {
      const label = config.key ?? `${config.points}_${config.duration}`;
      const keyBy = config.keyBy ?? 'ip';
      const limiter = this.getRouteLimiter(
        config.points,
        config.duration,
        label,
        keyBy,
        config.fallbackPoints,
      );
      const consumeKey = this.getConsumeKey(request, keyBy);
      await this.consumeLimit(
        limiter,
        consumeKey,
        label,
        config.redisFailurePolicy ?? getDefaultRedisFailurePolicy(),
      );
    }

    return true;
  }

  private async consumeLimit(
    limiter: ManagedRateLimiter,
    consumeKey: string,
    label: string,
    redisFailurePolicy: RedisFailurePolicy,
  ): Promise<void> {
    try {
      if (!limiter.primary) {
        throw new Error('Rate limiter backend is unavailable');
      }

      await limiter.primary.consume(consumeKey);
    } catch (err) {
      if (isRateLimitExceeded(err)) {
        this.throwTooManyRequests(err, label);
      }

      this.logger.warn(
        `Rate limiter backend failed for ${label}; policy=${redisFailurePolicy}`,
      );

      if (redisFailurePolicy === 'fail-open') {
        return;
      }

      if (redisFailurePolicy === 'fail-closed') {
        throw new HttpException(
          {
            message: 'Rate limit service unavailable',
            limit: label,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      await this.consumeFallbackLimit(limiter, consumeKey, label);
    }
  }

  private async consumeFallbackLimit(
    limiter: ManagedRateLimiter,
    consumeKey: string,
    label: string,
  ): Promise<void> {
    try {
      await limiter.fallback.consume(consumeKey);
    } catch (err) {
      if (isRateLimitExceeded(err)) {
        this.throwTooManyRequests(err, label);
      }

      throw new HttpException(
        {
          message: 'Rate limit service unavailable',
          limit: label,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private throwTooManyRequests(err: RateLimiterRes, label: string): never {
    const retryAfter = Math.ceil(err.msBeforeNext / 1000);
    throw new HttpException(
      {
        message: 'Too Many Requests',
        limit: label,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getRouteLimiter(
    points: number,
    duration: number,
    label: string,
    keyBy: RateLimitKeyBy,
    fallbackPoints?: number,
  ): ManagedRateLimiter {
    const resolvedFallbackPoints = getFallbackPoints(points, fallbackPoints);
    const key = `${label}_${keyBy}_${points}_${duration}_${resolvedFallbackPoints}`;
    if (!routeLimiters.has(key)) {
      routeLimiters.set(
        key,
        createManagedLimiter(
          points,
          duration,
          `rl_route_${key}`,
          resolvedFallbackPoints,
        ),
      );
    }
    return routeLimiters.get(key)!;
  }

  private getGlobalKeyTypes(request: any): RateLimitKeyBy[] {
    const keyTypes: RateLimitKeyBy[] = ['ip'];

    if (request.device?._id) {
      keyTypes.push('device');
    }

    if (request.wallet?.address) {
      keyTypes.push('wallet');
    }

    return keyTypes;
  }

  private getConsumeKey(request: any, keyBy: RateLimitKeyBy): string {
    if (keyBy === 'ip') {
      return `ip:${request.ip ?? 'unknown'}`;
    }

    if (keyBy === 'device') {
      const deviceId = request.device?._id;
      if (!deviceId) {
        throw new UnauthorizedException(
          'Device context not found for rate limit.',
        );
      }

      return `device:${String(deviceId)}`;
    }

    const walletAddress = request.wallet?.address;
    if (!walletAddress) {
      throw new UnauthorizedException(
        'Wallet context not found for rate limit.',
      );
    }

    return `wallet:${String(walletAddress).toLowerCase()}`;
  }
}
