import { BadRequestException } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';

const MAX_EML_BYTES = 10_000;

export function validateOwner(owner: string): void {
  if (typeof owner !== 'string' || !StrKey.isValidEd25519PublicKey(owner)) {
    throw new BadRequestException('owner must be a valid Stellar public address');
  }
}

export function validateEml(eml: Buffer): void {
  if (eml.length > MAX_EML_BYTES) {
    throw new BadRequestException('email must be at most 10 KB');
  }

  const text = eml.toString('latin1');
  if (!/^DKIM-Signature\s*:/im.test(text)) {
    throw new BadRequestException('email must contain a DKIM-Signature header');
  }
  if (!text.includes('\r\n') || /(^|[^\r])\n|\r(?!\n)/.test(text)) {
    throw new BadRequestException('email must use CRLF line endings');
  }
}
