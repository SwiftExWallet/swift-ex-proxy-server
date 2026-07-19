import { SetMetadata } from '@nestjs/common';

export type RateLimitKeyBy = 'ip' | 'device' | 'wallet';

export interface RateLimitConfig {
  points: number;
  duration: number;
  key?: string; // optional label e.g. 'per-minute', 'per-hour'
  keyBy?: RateLimitKeyBy;
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
