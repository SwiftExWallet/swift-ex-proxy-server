const DEFAULT_PROVIDER_HTTP_TIMEOUT_MS = 8_000;
const DEFAULT_PROVIDER_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_PROVIDER_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_PROVIDER_RETRY_MAX_DELAY_MS = 5_000;
const DEFAULT_PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const DEFAULT_PROVIDER_CIRCUIT_BREAKER_OPEN_MS = 30_000;
const DEFAULT_PROVIDER_BULKHEAD_MAX_CONCURRENT = 10;
const DEFAULT_PROVIDER_BULKHEAD_QUEUE_LIMIT = 25;

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export interface ProviderControlOptions extends RetryOptions {
  failureThreshold?: number;
  openMs?: number;
  maxConcurrent?: number;
  queueLimit?: number;
  shouldRecordFailure?: (error: unknown) => boolean;
}

export interface ProviderRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

export interface ProviderControlConfig {
  failureThreshold: number;
  openMs: number;
  maxConcurrent: number;
  queueLimit: number;
}

interface CircuitBreakerState {
  failures: number;
  openedUntil: number;
}

interface BulkheadState {
  active: number;
  queue: Array<() => void>;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();
const bulkheads = new Map<string, BulkheadState>();

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

export function getProviderControlConfig(): ProviderControlConfig {
  return {
    failureThreshold: getPositiveNumberEnv(
      'PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      DEFAULT_PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    ),
    openMs: getPositiveNumberEnv(
      'PROVIDER_CIRCUIT_BREAKER_OPEN_MS',
      DEFAULT_PROVIDER_CIRCUIT_BREAKER_OPEN_MS,
    ),
    maxConcurrent: getPositiveNumberEnv(
      'PROVIDER_BULKHEAD_MAX_CONCURRENT',
      DEFAULT_PROVIDER_BULKHEAD_MAX_CONCURRENT,
    ),
    queueLimit: getPositiveNumberEnv(
      'PROVIDER_BULKHEAD_QUEUE_LIMIT',
      DEFAULT_PROVIDER_BULKHEAD_QUEUE_LIMIT,
    ),
  };
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

function createProviderCircuitOpenError(key: string): Error {
  const error = new Error(`Provider circuit is open for ${key}`);
  (error as NodeJS.ErrnoException).code = 'PROVIDER_CIRCUIT_OPEN';
  return error;
}

function createProviderBulkheadRejectedError(key: string): Error {
  const error = new Error(`Provider bulkhead queue is full for ${key}`);
  (error as NodeJS.ErrnoException).code = 'PROVIDER_BULKHEAD_REJECTED';
  return error;
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

function getBulkheadState(key: string): BulkheadState {
  let state = bulkheads.get(key);
  if (!state) {
    state = { active: 0, queue: [] };
    bulkheads.set(key, state);
  }
  return state;
}

async function acquireBulkhead(
  key: string,
  maxConcurrent: number,
  queueLimit: number,
): Promise<() => void> {
  const state = getBulkheadState(key);

  if (state.active < maxConcurrent) {
    state.active += 1;
    return () => releaseBulkhead(key);
  }

  if (state.queue.length >= queueLimit) {
    throw createProviderBulkheadRejectedError(key);
  }

  await new Promise<void>((resolve) => {
    state.queue.push(resolve);
  });

  return () => releaseBulkhead(key);
}

function releaseBulkhead(key: string): void {
  const state = bulkheads.get(key);
  if (!state) {
    return;
  }

  const next = state.queue.shift();
  if (next) {
    next();
    return;
  }

  state.active = Math.max(0, state.active - 1);

  if (state.active === 0 && state.queue.length === 0) {
    bulkheads.delete(key);
  }
}

function assertCircuitClosed(key: string): void {
  const state = circuitBreakers.get(key);
  if (!state) {
    return;
  }

  if (state.openedUntil === 0) {
    return;
  }

  if (state.openedUntil > Date.now()) {
    throw createProviderCircuitOpenError(key);
  }

  circuitBreakers.delete(key);
}

function recordCircuitSuccess(key: string): void {
  circuitBreakers.delete(key);
}

function recordCircuitFailure(
  key: string,
  failureThreshold: number,
  openMs: number,
): void {
  const state = circuitBreakers.get(key) ?? {
    failures: 0,
    openedUntil: 0,
  };

  state.failures += 1;
  if (state.failures >= failureThreshold) {
    state.openedUntil = Date.now() + openMs;
  }

  circuitBreakers.set(key, state);
}

export async function withProviderControls<T>(
  key: string,
  operation: (attempt: number) => Promise<T>,
  options: ProviderControlOptions = {},
): Promise<T> {
  const defaults = getProviderControlConfig();
  const failureThreshold = normalizePositiveInteger(
    options.failureThreshold,
    defaults.failureThreshold,
  );
  const openMs = normalizePositiveNumber(options.openMs, defaults.openMs);
  const maxConcurrent = normalizePositiveInteger(
    options.maxConcurrent,
    defaults.maxConcurrent,
  );
  const queueLimit = normalizePositiveInteger(
    options.queueLimit,
    defaults.queueLimit,
  );
  const shouldRecordFailure =
    options.shouldRecordFailure ?? isTransientProviderError;

  assertCircuitClosed(key);
  const release = await acquireBulkhead(key, maxConcurrent, queueLimit);

  try {
    const result = await withProviderRetry(operation, options);
    recordCircuitSuccess(key);
    return result;
  } catch (error) {
    if (shouldRecordFailure(error)) {
      recordCircuitFailure(key, failureThreshold, openMs);
    }
    throw error;
  } finally {
    release();
  }
}

export function resetProviderControlsForTesting(): void {
  circuitBreakers.clear();
  bulkheads.clear();
}
