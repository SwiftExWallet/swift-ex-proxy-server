import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RateLimiterAbstract,
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from 'rate-limiter-flexible';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import Redis from 'ioredis';

function createLimiter(
  points: number,
  duration: number,
  keyPrefix: string,
): RateLimiterAbstract {
  console.log('==== env ===', process.env.ENVIRONMENT);

  if (process.env.ENVIRONMENT === 'dev') {
    console.log('===== global ===');
    return new RateLimiterMemory({ points, duration });
  }
  console.log('===== redis ===');

  const redisClient = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    enableOfflineQueue: false,
  });

  return new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix,
    points,
    duration,
  });
}

const routeLimiters = new Map<string, RateLimiterMemory>();

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private globalLimiter: RateLimiterAbstract | null = null;

  private getGlobalLimiter(): RateLimiterAbstract {
    if (!this.globalLimiter) {
      // runs on first request, .env is ready ✅
      this.globalLimiter = createLimiter(2, 60, 'rl_global');
    }
    return this.globalLimiter;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    console.log('ENVIRONMENT', process.env.ENVIRONMENT);
    const config = this.reflector.getAllAndOverride<{
      points: number;
      duration: number;
    }>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);

    console.log('===== config ===', config);

    const ip = context.switchToHttp().getRequest().ip ?? 'unknown';
    const limiter = config
      ? this.getRouteLimiter(config)
      : this.getGlobalLimiter();

    try {
      await limiter.consume(ip);
      return true;
    } catch (err) {
      const retryAfter = Math.ceil((err as RateLimiterRes).msBeforeNext / 1000);
      throw new HttpException(
        { message: 'Too Many Requests', retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private getRouteLimiter({
    points,
    duration,
  }: {
    points: number;
    duration: number;
  }): RateLimiterMemory {
    const key = `${points}_${duration}`;
    if (!routeLimiters.has(key)) {
      routeLimiters.set(key, new RateLimiterMemory({ points, duration }));
    }
    return routeLimiters.get(key)!;
  }
}
