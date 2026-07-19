import { SetMetadata } from '@nestjs/common';

export type RateLimitKeyBy = 'ip' | 'device' | 'wallet';

export interface RateLimitConfig {
  points: number;
  duration: number;
  key?: string; // optional label e.g. 'per-minute', 'per-hour'
  keyBy?: RateLimitKeyBy;
}

export const RATE_LIMIT_KEY = 'RATE_LIMIT';

export const RateLimit = (...limits: RateLimitConfig[]) =>
  SetMetadata(RATE_LIMIT_KEY, limits);
