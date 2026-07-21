import { ValidateAddress } from './utilityMethods';

describe('ValidateAddress', () => {
  it('returns string array unchanged', () => {
    const input = ['0xAAA', '0xBBB'];
    expect(ValidateAddress(input)).toEqual(['0xAAA', '0xBBB']);
  });

  it('filters non-string entries from mixed array', () => {
    const input = ['0xAAA', 123, null, '0xBBB'] as any;
    expect(ValidateAddress(input)).toEqual(['0xAAA', '0xBBB']);
  });

  it('splits comma-separated string', () => {
    expect(ValidateAddress('0xAAA,0xBBB,0xCCC')).toEqual(['0xAAA', '0xBBB', '0xCCC']);
  });

  it('splits space-separated string', () => {
    expect(ValidateAddress('0xAAA 0xBBB')).toEqual(['0xAAA', '0xBBB']);
  });

  it('handles mixed comma and space separators', () => {
    expect(ValidateAddress('0xAAA, 0xBBB,0xCCC')).toEqual(['0xAAA', '0xBBB', '0xCCC']);
  });

  it('returns empty array for empty string', () => {
    expect(ValidateAddress('')).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    expect(ValidateAddress([])).toEqual([]);
  });

  it('trims whitespace from addresses', () => {
    expect(ValidateAddress('  0xAAA  ,  0xBBB  ')).toEqual(['0xAAA', '0xBBB']);
  });
});
