import { SetMetadata } from '@nestjs/common';
export interface RateLimitConfig {
  points: number;
  duration: number;
  key?: string; // optional label e.g. 'per-minute', 'per-hour'
}

export const RATE_LIMIT_KEY = 'RATE_LIMIT';

export const RateLimit = (...limits: RateLimitConfig[]) =>
  SetMetadata(RATE_LIMIT_KEY, limits);
