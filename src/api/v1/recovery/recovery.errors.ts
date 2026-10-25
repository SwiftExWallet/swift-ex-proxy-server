import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';

export function mapRecoveryError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/RecoveryInProgress|recovery in progress|code[^0-9]*4/i.test(message)) return new ConflictException('recovery already pending for this owner');
  if (/invalid address|owner must be/i.test(message)) return new BadRequestException(message);
  return new UnprocessableEntityException(`recovery proof rejected: ${message}`);
}
