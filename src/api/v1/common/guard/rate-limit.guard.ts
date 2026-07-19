import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
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
} from '../decorators/rate-limit.decorator';
import { createRedisClient } from '../config/datastore.config';

function createLimiter(
  points: number,
  duration: number,
  keyPrefix: string,
): RateLimiterAbstract {
  if (process.env.ENVIRONMENT === 'dev') {
    return new RateLimiterMemory({ points, duration });
  }

  const redisClient = createRedisClient({
    enableOfflineQueue: false,
  });

  return new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix,
    points,
    duration,
  });
}

const routeLimiters = new Map<string, RateLimiterAbstract>();
const GLOBAL_RATE_LIMIT_POINTS = 100;
const GLOBAL_RATE_LIMIT_DURATION_SECONDS = 60;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private readonly globalLimiters = new Map<
    RateLimitKeyBy,
    RateLimiterAbstract
  >();

  private getGlobalLimiter(keyBy: RateLimitKeyBy): RateLimiterAbstract {
    if (!this.globalLimiters.has(keyBy)) {
      this.globalLimiters.set(
        keyBy,
        createLimiter(
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
      );
      const consumeKey = this.getConsumeKey(request, keyBy);
      await this.consumeLimit(limiter, consumeKey, label);
    }

    return true;
  }

  private async consumeLimit(
    limiter: RateLimiterAbstract,
    consumeKey: string,
    label: string,
  ): Promise<void> {
    try {
      await limiter.consume(consumeKey);
    } catch (err) {
      const retryAfter = Math.ceil((err as RateLimiterRes).msBeforeNext / 1000);
      throw new HttpException(
        {
          message: 'Too Many Requests',
          limit: label,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private getRouteLimiter(
    points: number,
    duration: number,
    label: string,
    keyBy: RateLimitKeyBy,
  ): RateLimiterAbstract {
    const key = `${label}_${keyBy}_${points}_${duration}`;
    if (!routeLimiters.has(key)) {
      routeLimiters.set(
        key,
        createLimiter(points, duration, `rl_route_${key}`),
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
