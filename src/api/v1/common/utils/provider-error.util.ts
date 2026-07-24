import { BadRequestException, HttpException } from '@nestjs/common';

export enum ProviderErrorCode {
  RequestFailed = 'PROVIDER_REQUEST_FAILED',
  Timeout = 'PROVIDER_TIMEOUT',
  RateLimited = 'PROVIDER_RATE_LIMITED',
  CircuitOpen = 'PROVIDER_CIRCUIT_OPEN',
  ProviderBusy = 'PROVIDER_BUSY',
  BadResponse = 'PROVIDER_BAD_RESPONSE',
  RouteNotFound = 'PROVIDER_ROUTE_NOT_FOUND',
  TransactionRejected = 'PROVIDER_TRANSACTION_REJECTED',
}

interface ProviderErrorLike {
  code?: string;
  name?: string;
  reason?: string;
  message?: string;
  shortMessage?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
  info?: {
    error?: {
      message?: string;
    };
  };
}

const SAFE_PROVIDER_MESSAGES: Record<ProviderErrorCode, string> = {
  [ProviderErrorCode.RequestFailed]: 'Provider request failed.',
  [ProviderErrorCode.Timeout]: 'Provider request timed out.',
  [ProviderErrorCode.RateLimited]:
    'Provider rate limit exceeded. Please try again later.',
  [ProviderErrorCode.CircuitOpen]:
    'Provider is temporarily unavailable. Please try again later.',
  [ProviderErrorCode.ProviderBusy]: 'Provider is busy. Please try again later.',
  [ProviderErrorCode.BadResponse]: 'Provider rejected the request.',
  [ProviderErrorCode.RouteNotFound]:
    'No provider route was found for this request.',
  [ProviderErrorCode.TransactionRejected]: 'Provider rejected the transaction.',
};

function getErrorLike(error: unknown): ProviderErrorLike {
  return (error ?? {}) as ProviderErrorLike;
}

function stringifyProviderData(data: unknown): string {
  if (data == null) {
    return '';
  }

  if (typeof data === 'string') {
    return data;
  }

  try {
    return JSON.stringify(data);
  } catch {
    return '';
  }
}

function buildProviderFingerprint(error: unknown): string {
  const candidate = getErrorLike(error);
  return [
    candidate.code,
    candidate.name,
    candidate.reason,
    candidate.message,
    candidate.shortMessage,
    candidate.info?.error?.message,
    stringifyProviderData(candidate.response?.data),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function classifyProviderError(
  error: unknown,
  fallback: ProviderErrorCode = ProviderErrorCode.RequestFailed,
): ProviderErrorCode {
  const candidate = getErrorLike(error);
  const status = candidate.response?.status;
  const fingerprint = buildProviderFingerprint(error);

  if (candidate.code === ProviderErrorCode.CircuitOpen) {
    return ProviderErrorCode.CircuitOpen;
  }

  if (candidate.code === 'PROVIDER_BULKHEAD_REJECTED') {
    return ProviderErrorCode.ProviderBusy;
  }

  if (
    status === 408 ||
    candidate.name === 'AbortError' ||
    candidate.name === 'TimeoutError' ||
    candidate.code === 'ETIMEDOUT' ||
    fingerprint.includes('timeout') ||
    fingerprint.includes('timed out')
  ) {
    return ProviderErrorCode.Timeout;
  }

  if (
    status === 429 ||
    fingerprint.includes('rate limit') ||
    fingerprint.includes('too many requests') ||
    fingerprint.includes('quota')
  ) {
    return ProviderErrorCode.RateLimited;
  }

  if (
    fingerprint.includes('no route') ||
    fingerprint.includes('route failure') ||
    fingerprint.includes('route not found') ||
    fingerprint.includes('no liquidity') ||
    fingerprint.includes('liquidity pool') ||
    fingerprint.includes('pool not found')
  ) {
    return ProviderErrorCode.RouteNotFound;
  }

  if (
    fingerprint.includes('revert') ||
    fingerprint.includes('reverted') ||
    fingerprint.includes('call exception') ||
    fingerprint.includes('transaction failed') ||
    fingerprint.includes('transaction rejected') ||
    fingerprint.includes('insufficient funds') ||
    fingerprint.includes('nonce too low') ||
    fingerprint.includes('replacement transaction')
  ) {
    return ProviderErrorCode.TransactionRejected;
  }

  if (status && status >= 400 && status < 500) {
    return ProviderErrorCode.BadResponse;
  }

  return fallback;
}

export function createProviderBadRequestException(
  error: unknown,
  fallback: ProviderErrorCode = ProviderErrorCode.RequestFailed,
): BadRequestException {
  const code = classifyProviderError(error, fallback);
  return new BadRequestException({
    code,
    message: SAFE_PROVIDER_MESSAGES[code],
  });
}

export function throwIfHttpException(error: unknown): void {
  if (error instanceof HttpException) {
    throw error;
  }
}
