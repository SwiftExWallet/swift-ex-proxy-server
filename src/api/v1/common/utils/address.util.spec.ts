import { isStellarAddress, normalizeWalletAddress } from './address.util';

describe('address utils', () => {
  const stellarAddress =
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  it('detects Stellar public keys and memo-prefixed Stellar addresses', () => {
    expect(isStellarAddress(stellarAddress)).toBe(true);
    expect(isStellarAddress(`MEMO-${stellarAddress}`)).toBe(true);
    expect(isStellarAddress('0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD')).toBe(
      false,
    );
  });

  it('lowercases EVM addresses but preserves Stellar address casing', () => {
    expect(
      normalizeWalletAddress('0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD'),
    ).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
    expect(normalizeWalletAddress(stellarAddress)).toBe(stellarAddress);
  });
});
