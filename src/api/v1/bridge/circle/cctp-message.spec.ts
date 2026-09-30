import { normalizeStellarHash, validateBurnMessage } from './cctp-message';

export const expectedBurn = {
  destinationDomain: 0,
  sender: '0x' + '11'.repeat(32),
  recipient: '0x' + '00'.repeat(12) + '22'.repeat(20),
  burnToken: '0x' + '33'.repeat(32),
  mintRecipient: '0x' + '00'.repeat(12) + '44'.repeat(20),
  messageSender: '0x' + '55'.repeat(32),
  amount: 1492500n,
  maxFee: 100n,
};
export function burnMessage(attested = true): string {
  const b = Buffer.alloc(376);
  b.writeUInt32BE(1, 0);
  b.writeUInt32BE(27, 4);
  b.writeUInt32BE(0, 8);
  if (attested) b.fill(9, 12, 44);
  Buffer.from(expectedBurn.sender.slice(2), 'hex').copy(b, 44);
  Buffer.from(expectedBurn.recipient.slice(2), 'hex').copy(b, 76);
  b.writeUInt32BE(2000, 140);
  b.writeUInt32BE(attested ? 2000 : 0, 144);
  b.writeUInt32BE(1, 148);
  for (const [key, offset] of [
    ['burnToken', 152],
    ['mintRecipient', 184],
    ['messageSender', 248],
  ] as const)
    Buffer.from(expectedBurn[key].slice(2), 'hex').copy(b, offset);
  b.writeBigUInt64BE(1492500n, 240);
  b.writeBigUInt64BE(100n, 304);
  return '0x' + b.toString('hex');
}
describe('CCTP Stellar binary validation', () => {
  it('normalizes Stellar hashes without a 0x prefix', () => {
    expect(normalizeStellarHash('0X' + 'AB'.repeat(32))).toBe('ab'.repeat(32));
    expect(() => normalizeStellarHash('not-a-hash')).toThrow();
  });
  it('validates binary amounts and addresses without Iris decoded fields', () => {
    expect(validateBurnMessage(burnMessage(), expectedBurn).amount).toBe(
      1492500n,
    );
  });
  it.each([
    0, 4, 8, 44, 76, 108, 140, 144, 148, 152, 184, 216, 248, 280, 312, 344,
  ])('rejects a tampered field at byte %i', (offset) => {
    const b = Buffer.from(burnMessage().slice(2), 'hex');
    b[offset] ^= 1;
    expect(() =>
      validateBurnMessage('0x' + b.toString('hex'), expectedBurn),
    ).toThrow();
  });
  it('accepts unattested event fields only in source-event mode', () => {
    expect(() =>
      validateBurnMessage(burnMessage(false), expectedBurn),
    ).toThrow();
    expect(
      validateBurnMessage(burnMessage(false), expectedBurn, false).amount,
    ).toBe(1492500n);
  });
});
