import { BadRequestException } from '@nestjs/common';

export function normalizeStellarHash(hash: string): string {
  const clean = hash.replace(/^0x/i, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean))
    throw new BadRequestException('Invalid Stellar transaction hash');
  return clean;
}

export interface ExpectedBurn {
  destinationDomain: number;
  sender: string;
  recipient: string;
  burnToken: string;
  mintRecipient: string;
  messageSender: string;
  amount: bigint;
  maxFee: bigint;
}

export function validateBurnMessage(
  message: string,
  expected: ExpectedBurn,
  attested = true,
) {
  const requireField = (ok: boolean, field: string) => {
    if (!ok) throw new BadRequestException(`Invalid CCTP ${field}`);
  };
  requireField(/^0x[0-9a-fA-F]{752}$/.test(message), 'message length/encoding');
  const bytes = Buffer.from(message.slice(2), 'hex');
  const hex = (offset: number) =>
    '0x' + bytes.subarray(offset, offset + 32).toString('hex');
  const uint = (offset: number) => BigInt(hex(offset));
  requireField(
    bytes.readUInt32BE(0) === 1 && bytes.readUInt32BE(148) === 1,
    'version',
  );
  requireField(bytes.readUInt32BE(4) === 27, 'source domain');
  requireField(
    bytes.readUInt32BE(8) === expected.destinationDomain,
    'destination domain',
  );
  for (const [field, offset] of [
    ['sender', 44],
    ['recipient', 76],
    ['burnToken', 152],
    ['mintRecipient', 184],
    ['messageSender', 248],
  ] as const) {
    requireField(hex(offset) === expected[field].toLowerCase(), field);
  }
  requireField(uint(108) === 0n, 'destination caller');
  requireField(bytes.readUInt32BE(140) === 2000, 'minimum finality');
  requireField(
    bytes.readUInt32BE(144) === (attested ? 2000 : 0),
    'executed finality',
  );
  requireField(attested ? uint(12) !== 0n : uint(12) === 0n, 'nonce');
  requireField(uint(216) === expected.amount && expected.amount > 0n, 'amount');
  requireField(
    uint(280) === expected.maxFee && expected.maxFee < expected.amount,
    'maximum fee',
  );
  requireField(
    uint(312) <= expected.maxFee &&
      uint(312) < expected.amount &&
      (attested || uint(312) === 0n),
    'executed fee',
  );
  requireField(uint(344) === 0n, 'expiration block');
  return { nonce: hex(12), amount: uint(216), feeExecuted: uint(312) };
}

export function validateAttestation(attestation: string) {
  if (!/^0x(?:[0-9a-fA-F]{130})+$/.test(attestation)) {
    throw new BadRequestException(
      'Invalid CCTP attestation signature encoding',
    );
  }
}
