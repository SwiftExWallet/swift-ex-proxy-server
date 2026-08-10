import {
  EVM_ADDRESS_PATTERN,
  STELLAR_ADDRESS_PATTERN,
} from './walletAddress.constants';

describe('wallet address constants', () => {
  it('matches EVM wallet addresses', () => {
    expect(
      EVM_ADDRESS_PATTERN.test('0x1234567890123456789012345678901234567890'),
    ).toBe(true);
    expect(EVM_ADDRESS_PATTERN.test('0x1234')).toBe(false);
  });

  it('matches Stellar wallet addresses and muxed account values', () => {
    const stellarAddress =
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    expect(STELLAR_ADDRESS_PATTERN.test(stellarAddress)).toBe(true);
    expect(STELLAR_ADDRESS_PATTERN.test(`MEMO-${stellarAddress}`)).toBe(true);
    expect(STELLAR_ADDRESS_PATTERN.test('not-an-address')).toBe(false);
  });
});
