import { BadRequestException } from '@nestjs/common';
import { validateEml, validateOwner } from './recovery.validation';

describe('recovery validation', () => {
  it('accepts a DKIM-signed CRLF email below the upload limit', () => {
    expect(() =>
      validateEml(
        Buffer.from(
          'DKIM-Signature: v=1; d=example.com; s=test\r\nSubject: recovery\r\n\r\nbody',
          'latin1',
        ),
      ),
    ).not.toThrow();
  });

  it('rejects email without a DKIM signature', () => {
    expect(() => validateEml(Buffer.from('Subject: recovery\r\n\r\nbody'))).toThrow(
      'email must contain a DKIM-Signature header',
    );
  });

  it('rejects email with non-CRLF line endings', () => {
    expect(() =>
      validateEml(Buffer.from('DKIM-Signature: test\n\nbody')),
    ).toThrow('email must use CRLF line endings');
  });

  it('rejects an invalid Stellar owner', () => {
    expect(() => validateOwner('not-a-wallet')).toThrow(BadRequestException);
  });
});
