import {
  calculateBridgeQuote,
  calculateReverseBridgeQuote,
} from './bridge-fee';

describe('Stellar source bridge fees', () => {
  it('keeps a non-zero maxFee for standard EVM router calls', () => {
    expect(calculateBridgeQuote(2_000_000n, 25n, '0', false)).toEqual({
      protocolFee: 5_000n,
      maxFee: 1n,
      minimumReceived: 1_994_999n,
    });
  });

  it('deducts the treasury fee before calculating the CCTP fee', () => {
    expect(calculateReverseBridgeQuote(100_000_000n, 25n, '1.3')).toEqual({
      protocolFee: 250_000n,
      netAmount: 99_750_000n,
      maxFee: 15_561n,
      minimumReceived: 99_734_439n,
    });
  });

  it('rejects an amount consumed by fees', () => {
    expect(() => calculateReverseBridgeQuote(1n, 10_000n, '1')).toThrow();
  });
});
