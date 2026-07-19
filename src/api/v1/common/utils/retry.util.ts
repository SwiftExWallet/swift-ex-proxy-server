const DEFAULT_PROVIDER_HTTP_TIMEOUT_MS = 8_000;
const DEFAULT_PROVIDER_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_PROVIDER_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_PROVIDER_RETRY_MAX_DELAY_MS = 5_000;

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export interface ProviderRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

function getPositiveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return fallback;
  }

  return Math.floor(value);
}

function normalizePositiveNumber(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || !value || value < 1) {
    return fallback;
  }

  return value;
}

export function getProviderRetryConfig(): ProviderRetryConfig {
  return {
    maxAttempts: getPositiveNumberEnv(
      'PROVIDER_RETRY_MAX_ATTEMPTS',
      DEFAULT_PROVIDER_RETRY_MAX_ATTEMPTS,
    ),
    baseDelayMs: getPositiveNumberEnv(
      'PROVIDER_RETRY_BASE_DELAY_MS',
      DEFAULT_PROVIDER_RETRY_BASE_DELAY_MS,
    ),
    maxDelayMs: getPositiveNumberEnv(
      'PROVIDER_RETRY_MAX_DELAY_MS',
      DEFAULT_PROVIDER_RETRY_MAX_DELAY_MS,
    ),
    timeoutMs: getPositiveNumberEnv(
      'PROVIDER_HTTP_TIMEOUT_MS',
      DEFAULT_PROVIDER_HTTP_TIMEOUT_MS,
    ),
  };
}

export function getProviderHttpTimeoutMs(): number {
  return getProviderRetryConfig().timeoutMs;
}

export function isTransientProviderError(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    name?: string;
    response?: { status?: number };
  };

  if (
    candidate.name === 'AbortError' ||
    candidate.name === 'TimeoutError' ||
    candidate.code === 'ETIMEDOUT'
  ) {
    return true;
  }

  if (
    candidate.code &&
    [
      'ECONNABORTED',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
    ].includes(candidate.code)
  ) {
    return true;
  }

  const status = candidate.response?.status;
  if (!status) {
    return true;
  }

  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTimeoutError(timeoutMs: number): Error {
  const error = new Error(`Provider call timed out after ${timeoutMs}ms`);
  (error as NodeJS.ErrnoException).code = 'ETIMEDOUT';
  return error;
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(createTimeoutError(timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function withProviderRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const defaults = getProviderRetryConfig();
  const maxAttempts = normalizePositiveInteger(
    options.maxAttempts,
    defaults.maxAttempts,
  );
  const baseDelayMs = normalizePositiveNumber(
    options.baseDelayMs,
    defaults.baseDelayMs,
  );
  const maxDelayMs = normalizePositiveNumber(
    options.maxDelayMs,
    defaults.maxDelayMs,
  );
  const timeoutMs = normalizePositiveNumber(
    options.timeoutMs,
    defaults.timeoutMs,
  );
  const shouldRetry = options.shouldRetry ?? isTransientProviderError;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTimeout(operation(attempt), timeoutMs);
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      const retryDelay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await delay(retryDelay);
    }
  }

  throw lastError;
}
