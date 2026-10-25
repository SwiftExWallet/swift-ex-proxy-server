import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { poseidon10 } from 'poseidon-lite';
import { RecoveryAttemptService } from './recovery-attempt.service';
import { RecoveryConfigService } from './recovery.config';
import { RecoveryAttemptStatus } from './recovery.types';
import { RecoveryChainService, RecoveryRegistrationAsset } from './recovery-chain.service';
import { RecoveryRegistrationService } from './recovery-registration.service';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const MIN_NATIVE_XLM_FLOOR = 10_000_000n;

function commitmentFor(email: string, salt: Buffer): Buffer {
  const value = Buffer.from(normalizeEmail(email));
  if (value.length > 255) throw new BadRequestException('Recovery email is longer than the circuit allows');
  const packed = Array.from({ length: 9 }, (_, chunk) => {
    let item = 0n;
    const start = chunk * 31;
    for (let index = Math.min(start + 31, value.length) - 1; index >= start; index -= 1) item = (item << 8n) | BigInt(value[index]);
    return item;
  });
  const saltValue = BigInt(`0x${salt.toString('hex')}`);
  return Buffer.from(poseidon10([...packed, saltValue]).toString(16).padStart(64, '0'), 'hex');
}

@Injectable()
export class RecoveryTransactionService {
  constructor(
    private readonly chain: RecoveryChainService,
    private readonly registrations: RecoveryRegistrationService,
    private readonly attempts: RecoveryAttemptService,
    private readonly config: RecoveryConfigService,
  ) {}

  async prepareRegistration(owner: string, email: string, assets: { type: 'native' | 'classic' | 'contract'; token?: string; code?: string; issuer?: string; floor: string }[]) {
    const salt = randomBytes(32); salt[0] = 0;
    const encodedAssets: RecoveryRegistrationAsset[] = assets.map(asset => ({...asset, floor: BigInt(asset.floor)}));
    const maxI128 = (1n << 127n) - 1n;
    if (encodedAssets.some(asset => asset.floor > maxI128)) throw new BadRequestException('asset floor exceeds Soroban i128 range');
    const nativeFloor = this.config.recovery.registrationFloor > MIN_NATIVE_XLM_FLOOR
      ? this.config.recovery.registrationFloor
      : MIN_NATIVE_XLM_FLOOR;
    if (encodedAssets.some(asset => asset.type === 'native' && asset.floor < nativeFloor)) {
      throw new BadRequestException(`native XLM floor must be at least ${nativeFloor} stroops`);
    }
    return { unsignedXdr: await this.chain.prepareRegistration(owner, commitmentFor(email, salt), salt, encodedAssets) };
  }

  async confirmRegistration(owner: string, email: string, hash: string, device: any) {
    await this.chain.finalized(hash);
    const registration = await this.chain.registration(owner);
    if (!registration) throw new BadRequestException('recovery registration is not present on-chain');
    const salt = Buffer.from(registration.salt.replace(/^0x/, ''), 'hex');
    if (!commitmentFor(email, salt).equals(Buffer.from(registration.commitment.replace(/^0x/, ''), 'hex'))) throw new BadRequestException('recovery email does not match on-chain registration');
    return this.registrations.register(email, owner, device);
  }

  async prepareCancellation(owner: string) { return { unsignedXdr: await this.chain.prepareCancellation(owner) }; }

  async confirmCancellation(owner: string, hash: string) {
    await this.chain.finalized(hash);
    if (await this.chain.pending(owner)) throw new BadRequestException('recovery is still pending on-chain');
    const attempt = await this.attempts.latest(owner);
    return attempt && [RecoveryAttemptStatus.STARTED, RecoveryAttemptStatus.PENDING, RecoveryAttemptStatus.EXECUTING].includes(attempt.status)
      ? this.attempts.update(attempt._id, { status: RecoveryAttemptStatus.CANCELLED }) : attempt;
  }
}
