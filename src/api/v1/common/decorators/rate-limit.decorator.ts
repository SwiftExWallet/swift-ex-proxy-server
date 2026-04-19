import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'RATE_LIMIT';

export const RateLimit = (points: number, duration: number) =>
  SetMetadata(RATE_LIMIT_KEY, { points, duration });
