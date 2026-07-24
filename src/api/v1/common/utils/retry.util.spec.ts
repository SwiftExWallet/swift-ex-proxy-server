import {
  getProviderControlConfig,
  getProviderRetryConfig,
  isTransientProviderError,
  resetProviderControlsForTesting,
  withProviderControls,
  withProviderRetry,
} from './retry.util';

describe('retry util', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetProviderControlsForTesting();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('loads provider retry config from environment with defaults', () => {
    process.env.PROVIDER_HTTP_TIMEOUT_MS = '9000';
    process.env.PROVIDER_RETRY_MAX_ATTEMPTS = '4';
    process.env.PROVIDER_RETRY_BASE_DELAY_MS = '250';
    process.env.PROVIDER_RETRY_MAX_DELAY_MS = '2000';

    expect(getProviderRetryConfig()).toEqual({
      timeoutMs: 9000,
      maxAttempts: 4,
      baseDelayMs: 250,
      maxDelayMs: 2000,
    });
  });

  it('loads provider control config from environment with defaults', () => {
    process.env.PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD = '7';
    process.env.PROVIDER_CIRCUIT_BREAKER_OPEN_MS = '12000';
    process.env.PROVIDER_BULKHEAD_MAX_CONCURRENT = '3';
    process.env.PROVIDER_BULKHEAD_QUEUE_LIMIT = '9';

    expect(getProviderControlConfig()).toEqual({
      failureThreshold: 7,
      openMs: 12000,
      maxConcurrent: 3,
      queueLimit: 9,
    });
  });

  it('retries transient failures and returns the successful result', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce({ code: 'ECONNRESET' })
      .mockResolvedValueOnce('ok');

    const result = withProviderRetry(operation, {
      maxAttempts: 2,
      baseDelayMs: 50,
      maxDelayMs: 50,
      timeoutMs: 1000,
    });

    await jest.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenNthCalledWith(1, 1);
    expect(operation).toHaveBeenNthCalledWith(2, 2);
  });

  it('does not retry non-transient client failures', async () => {
    const error = { response: { status: 400 } };
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      withProviderRetry(operation, {
        maxAttempts: 3,
        baseDelayMs: 50,
        timeoutMs: 1000,
      }),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('times out provider calls', async () => {
    const operation = jest.fn().mockReturnValue(new Promise(() => undefined));
    const result = withProviderRetry(operation, {
      maxAttempts: 1,
      timeoutMs: 25,
    });
    const expectation = expect(result).rejects.toMatchObject({
      code: 'ETIMEDOUT',
    });

    await jest.advanceTimersByTimeAsync(25);

    await expectation;
  });

  it('classifies retryable provider errors', () => {
    expect(isTransientProviderError({ response: { status: 429 } })).toBe(true);
    expect(isTransientProviderError({ response: { status: 503 } })).toBe(true);
    expect(isTransientProviderError({ response: { status: 400 } })).toBe(false);
    expect(isTransientProviderError({ name: 'AbortError' })).toBe(true);
  });

  it('opens circuit after the configured controlled-call failure threshold', async () => {
    const key = 'test:circuit';
    const error = { response: { status: 503 } };
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      withProviderControls(key, operation, {
        maxAttempts: 1,
        failureThreshold: 2,
        openMs: 1000,
      }),
    ).rejects.toBe(error);
    await expect(
      withProviderControls(key, operation, {
        maxAttempts: 1,
        failureThreshold: 2,
        openMs: 1000,
      }),
    ).rejects.toBe(error);
    await expect(
      withProviderControls(key, operation, {
        maxAttempts: 1,
        failureThreshold: 2,
        openMs: 1000,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_CIRCUIT_OPEN' });

    operation.mockResolvedValueOnce('ok');
    await jest.advanceTimersByTimeAsync(1000);

    await expect(
      withProviderControls(key, operation, {
        maxAttempts: 1,
        failureThreshold: 2,
        openMs: 1000,
      }),
    ).resolves.toBe('ok');
  });

  it('rejects controlled calls when the provider bulkhead queue is full', async () => {
    const key = 'test:bulkhead';
    let releaseFirst: (value: string) => void = () => undefined;
    const first = withProviderControls(
      key,
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = resolve;
        }),
      {
        maxAttempts: 1,
        timeoutMs: 1000,
        maxConcurrent: 1,
        queueLimit: 1,
      },
    );
    const second = withProviderControls(key, () => Promise.resolve('second'), {
      maxAttempts: 1,
      timeoutMs: 1000,
      maxConcurrent: 1,
      queueLimit: 1,
    });

    await expect(
      withProviderControls(key, () => Promise.resolve('third'), {
        maxAttempts: 1,
        timeoutMs: 1000,
        maxConcurrent: 1,
        queueLimit: 1,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_BULKHEAD_REJECTED' });

    releaseFirst('first');

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });
});
