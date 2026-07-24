import { BadRequestException } from '@nestjs/common';
import {
  classifyProviderError,
  createProviderBadRequestException,
  ProviderErrorCode,
  throwIfHttpException,
} from './provider-error.util';

describe('provider-error util', () => {
  it('classifies timeouts without exposing raw messages', () => {
    const error = new Error('Provider call timed out after 8000ms');
    (error as NodeJS.ErrnoException).code = 'ETIMEDOUT';

    const exception = createProviderBadRequestException(error);

    expect(classifyProviderError(error)).toBe(ProviderErrorCode.Timeout);
    expect(exception.getResponse()).toEqual({
      code: ProviderErrorCode.Timeout,
      message: 'Provider request timed out.',
    });
    expect(JSON.stringify(exception.getResponse())).not.toContain('8000ms');
  });

  it('classifies provider rate limits from response data', () => {
    const error = {
      response: {
        status: 429,
        data: {
          description: 'API key quota exhausted for upstream provider',
        },
      },
    };

    const exception = createProviderBadRequestException(error);

    expect(exception.getResponse()).toEqual({
      code: ProviderErrorCode.RateLimited,
      message: 'Provider rate limit exceeded. Please try again later.',
    });
    expect(JSON.stringify(exception.getResponse())).not.toContain('quota');
  });

  it('classifies route failures without returning provider route details', () => {
    const error = {
      response: {
        status: 400,
        data: 'No route through internal pool 0xabcdef',
      },
    };

    const exception = createProviderBadRequestException(error);

    expect(exception.getResponse()).toEqual({
      code: ProviderErrorCode.RouteNotFound,
      message: 'No provider route was found for this request.',
    });
    expect(JSON.stringify(exception.getResponse())).not.toContain('0xabcdef');
  });

  it('classifies generic client-side provider rejections', () => {
    const error = {
      response: {
        status: 400,
        data: {
          validation: 'internal provider validation details',
        },
      },
    };

    expect(createProviderBadRequestException(error).getResponse()).toEqual({
      code: ProviderErrorCode.BadResponse,
      message: 'Provider rejected the request.',
    });
  });

  it('classifies open provider circuits without exposing control keys', () => {
    const error = new Error('Provider circuit is open for private-key');
    (error as NodeJS.ErrnoException).code = ProviderErrorCode.CircuitOpen;

    const exception = createProviderBadRequestException(error);

    expect(exception.getResponse()).toEqual({
      code: ProviderErrorCode.CircuitOpen,
      message: 'Provider is temporarily unavailable. Please try again later.',
    });
    expect(JSON.stringify(exception.getResponse())).not.toContain(
      'private-key',
    );
  });

  it('classifies full provider bulkheads without exposing control keys', () => {
    const error = new Error('Provider bulkhead queue is full for private-key');
    (error as NodeJS.ErrnoException).code = 'PROVIDER_BULKHEAD_REJECTED';

    const exception = createProviderBadRequestException(error);

    expect(exception.getResponse()).toEqual({
      code: ProviderErrorCode.ProviderBusy,
      message: 'Provider is busy. Please try again later.',
    });
    expect(JSON.stringify(exception.getResponse())).not.toContain(
      'private-key',
    );
  });

  it('rethrows existing Nest HTTP exceptions unchanged', () => {
    const exception = new BadRequestException('Invalid client input');

    expect(() => throwIfHttpException(exception)).toThrow(exception);
  });
});
