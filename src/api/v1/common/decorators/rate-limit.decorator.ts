import { SetMetadata } from '@nestjs/common';

export type RateLimitKeyBy = 'ip' | 'device' | 'wallet';
export type RedisFailurePolicy =
  | 'fail-open'
  | 'fail-closed'
  | 'fallback-memory';

export interface RateLimitConfig {
  points: number;
  duration: number;
  key?: string; // optional label e.g. 'per-minute', 'per-hour'
  keyBy?: RateLimitKeyBy;
  redisFailurePolicy?: RedisFailurePolicy;
  fallbackPoints?: number;
}

export interface PrincipalRateLimitPoints {
  ip: number;
  device: number;
  wallet?: number;
}

export const RATE_LIMIT_KEY = 'RATE_LIMIT';

export const RateLimit = (...limits: RateLimitConfig[]) =>
  SetMetadata(RATE_LIMIT_KEY, limits);

export function rateLimitByIpAndDevice(
  key: string,
  points: Pick<PrincipalRateLimitPoints, 'ip' | 'device'>,
  duration = 60,
): RateLimitConfig[] {
  return [
    { points: points.ip, duration, key: `${key}-ip`, keyBy: 'ip' },
    { points: points.device, duration, key: `${key}-device`, keyBy: 'device' },
  ];
}

export function rateLimitByIpDeviceAndWallet(
  key: string,
  points: Required<PrincipalRateLimitPoints>,
  duration = 60,
): RateLimitConfig[] {
  return [
    ...rateLimitByIpAndDevice(key, points, duration),
    { points: points.wallet, duration, key: `${key}-wallet`, keyBy: 'wallet' },
  ];
}

export function failClosedRateLimits(
  limits: RateLimitConfig[],
): RateLimitConfig[] {
  return limits.map((limit) => ({
    ...limit,
    redisFailurePolicy: 'fail-closed',
  }));
}
