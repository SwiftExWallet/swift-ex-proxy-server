import { SetMetadata } from '@nestjs/common';

export interface BodySizeLimitConfig {
  maxBytes: number;
  key?: string;
}

export const BODY_SIZE_LIMIT_KEY = 'BODY_SIZE_LIMIT';

export const BODY_SIZE_LIMITS = {
  notification: 8 * 1024,
  simple: 16 * 1024,
  standard: 32 * 1024,
  swapOrder: 64 * 1024,
  signedTransactionBatch: 128 * 1024,
  providerOrderPayload: 256 * 1024,
} as const;

export const BodySizeLimit = (maxBytes: number, key?: string) =>
  SetMetadata(BODY_SIZE_LIMIT_KEY, { maxBytes, key });
