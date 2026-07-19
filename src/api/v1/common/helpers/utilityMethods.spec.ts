import { ValidateAddress } from './utilityMethods';

describe('ValidateAddress', () => {
  it('parses comma-separated address strings', () => {
    expect(ValidateAddress('0xabc,0xdef')).toEqual(['0xabc', '0xdef']);
  });

  it('parses space-separated address strings', () => {
    expect(ValidateAddress('0xabc 0xdef')).toEqual(['0xabc', '0xdef']);
  });

  it('trims and removes empty values from strings', () => {
    expect(ValidateAddress(' 0xabc,  , 0xdef   0xghi ')).toEqual([
      '0xabc',
      '0xdef',
      '0xghi',
    ]);
  });

  it('returns only string values from arrays', () => {
    expect(
      ValidateAddress([
        '0xabc',
        123,
        null,
        undefined,
        '0xdef',
      ] as unknown as string[]),
    ).toEqual(['0xabc', '0xdef']);
  });

  it('returns an empty array for invalid input', () => {
    expect(ValidateAddress(123 as unknown as string)).toEqual([]);
    expect(ValidateAddress(null as unknown as string)).toEqual([]);
    expect(ValidateAddress({ address: '0xabc' } as unknown as string)).toEqual(
      [],
    );
  });
});
