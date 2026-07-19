import { bigintJsonSerializerMiddleware } from './bigintJsonSerializer.middleware';

describe('bigintJsonSerializerMiddleware', () => {
  const createResponse = () => {
    const res = {
      json: jest.fn(function (this: any, body: any) {
        this.serializedBody = body;
        return this;
      }),
      serializedBody: undefined as any,
    };

    return res;
  };

  it('calls next and replaces res.json', () => {
    const res = createResponse();
    const originalJson = res.json;
    const next = jest.fn();

    bigintJsonSerializerMiddleware({} as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toBe(originalJson);
  });

  it('converts top-level BigInt values to strings', () => {
    const res = createResponse();
    const next = jest.fn();
    bigintJsonSerializerMiddleware({} as any, res as any, next);

    res.json({ value: 123n });

    expect(res.serializedBody).toEqual({ value: '123' });
  });

  it('converts nested BigInt values to strings', () => {
    const res = createResponse();
    const next = jest.fn();
    bigintJsonSerializerMiddleware({} as any, res as any, next);

    res.json({
      tx: {
        value: 123n,
        fee: {
          maxFeePerGas: 456n,
        },
      },
    });

    expect(res.serializedBody).toEqual({
      tx: {
        value: '123',
        fee: {
          maxFeePerGas: '456',
        },
      },
    });
  });

  it('converts BigInt values inside arrays to strings', () => {
    const res = createResponse();
    const next = jest.fn();
    bigintJsonSerializerMiddleware({} as any, res as any, next);

    res.json({
      values: [1n, 2n, { nested: 3n }],
    });

    expect(res.serializedBody).toEqual({
      values: ['1', '2', { nested: '3' }],
    });
  });

  it('preserves non-BigInt JSON values', () => {
    const res = createResponse();
    const next = jest.fn();
    bigintJsonSerializerMiddleware({} as any, res as any, next);

    res.json({
      string: 'value',
      number: 1,
      boolean: true,
      nullValue: null,
      array: ['a', 2, false],
    });

    expect(res.serializedBody).toEqual({
      string: 'value',
      number: 1,
      boolean: true,
      nullValue: null,
      array: ['a', 2, false],
    });
  });

  it('calls the original json with the response context', () => {
    const res = createResponse();
    const originalJson = res.json;
    const next = jest.fn();
    bigintJsonSerializerMiddleware({} as any, res as any, next);

    const result = res.json({ value: 123n });

    expect(originalJson).toHaveBeenCalledTimes(1);
    expect(result).toBe(res);
    expect(res.serializedBody).toEqual({ value: '123' });
  });
});
