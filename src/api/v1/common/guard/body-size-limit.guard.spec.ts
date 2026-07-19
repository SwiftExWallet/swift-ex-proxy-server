import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BODY_SIZE_LIMIT_KEY,
  BodySizeLimitConfig,
} from '../decorators/body-size-limit.decorator';
import { BodySizeLimitGuard } from './body-size-limit.guard';

describe('BodySizeLimitGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: BodySizeLimitGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new BodySizeLimitGuard(reflector as unknown as Reflector);
  });

  function createContext(request: any): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  function useLimit(config?: BodySizeLimitConfig): void {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === BODY_SIZE_LIMIT_KEY ? config : undefined,
    );
  }

  it('allows routes without body size metadata', () => {
    useLimit(undefined);

    expect(
      guard.canActivate(
        createContext({ headers: { 'content-length': '999' } }),
      ),
    ).toBe(true);
  });

  it('allows requests at or below the configured route limit', () => {
    useLimit({ maxBytes: 100, key: 'test-route' });

    expect(
      guard.canActivate(
        createContext({ headers: { 'content-length': '100' } }),
      ),
    ).toBe(true);
  });

  it('rejects requests above the configured route limit', () => {
    useLimit({ maxBytes: 100, key: 'test-route' });

    expect(() =>
      guard.canActivate(
        createContext({ headers: { 'content-length': '101' } }),
      ),
    ).toThrow(HttpException);

    try {
      guard.canActivate(
        createContext({ headers: { 'content-length': '101' } }),
      );
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
      expect((error as HttpException).getResponse()).toEqual({
        code: 'REQUEST_BODY_TOO_LARGE',
        message: 'Request body too large.',
        limit: 'test-route',
        maxBytes: 100,
      });
    }
  });

  it('rejects missing or invalid content length on limited routes', () => {
    useLimit({ maxBytes: 100, key: 'strict-route' });

    for (const contentLength of [undefined, '', 'abc', '-1', '1.5']) {
      expect(() =>
        guard.canActivate(
          createContext({ headers: { 'content-length': contentLength } }),
        ),
      ).toThrow(HttpException);
    }
  });
});
