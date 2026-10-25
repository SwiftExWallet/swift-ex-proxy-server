import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RecoveryChainService } from './recovery-chain.service';
import { RecoveryConfigService } from './recovery.config';
import { RecoveryProofService } from './recovery-proof.service';
import { mapRecoveryError } from './recovery.errors';
import { validateEml, validateOwner } from './recovery.validation';
import { RecoveryAttemptService } from './recovery-attempt.service';
import { RecoveryAttemptStatus } from './recovery.types';

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    private readonly chain: RecoveryChainService,
    private readonly proofs: RecoveryProofService,
    private readonly config: RecoveryConfigService,
    private readonly attempts: RecoveryAttemptService,
  ) {}

  async start(owner: string, eml: Buffer) {
    try {
      validateOwner(owner);
      validateEml(eml);
    } catch (error) {
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException((error as Error).message);
    }
    let attempt: { _id?: unknown } | null = null;
    try {
      attempt = await this.attempts.createStarted(owner);
      await this.chain.assertConfiguredVerifier();
      const registration = await this.chain.registration(owner);
      if (!registration) throw new Error('NotRegistered');
      if (await this.chain.pending(owner)) {
        throw new Error('RecoveryInProgress');
      }
      const salt = BigInt(
        registration.salt.startsWith('0x')
          ? registration.salt
          : `0x${registration.salt}`,
      ).toString(10);
      const proof = await this.proofs.prove(eml, salt);
      const destination = await this.chain.previewDestination(
        proof.publicInputs,
      );
      const tx = await this.chain.startRecovery(owner, proof);
      const pending = await this.chain.pending(owner);
      if (!pending) {
        throw new Error('start_recovery succeeded without pending state');
      }
      await this.attempts.update(attempt._id, {
        status: RecoveryAttemptStatus.PENDING,
        startUserOpTx: tx.hash,
        destination,
        unlockAt: pending.unlockAt.toString(),
      });
      return {
        attemptId: attempt._id,
        userOpTx: tx.hash,
        destination,
        unlockAt: pending.unlockAt,
        nullifier: pending.nullifier,
      };
    } catch (error) {
      if (attempt?._id !== undefined) {
        await this.attempts.update(attempt._id, {
          status: RecoveryAttemptStatus.FAILED,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.logger.warn(
        `recovery start failed for owner ${owner}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw mapRecoveryError(error);
    }
  }

  async status(owner: string) {
    validateOwner(owner);
    return this.attempts.latest(owner);
  }

  async execute(owner: string) {
    validateOwner(owner);
    const attempt = await this.attempts.latest(owner);
    if (!attempt || attempt.status !== RecoveryAttemptStatus.PENDING) {
      throw new ConflictException('recovery is not ready for execution');
    }
    try {
      await this.attempts.update(attempt._id, {
        status: RecoveryAttemptStatus.EXECUTING,
      });
      const result = await this.chain.executeRecovery(owner);
      await this.attempts.update(attempt._id, {
        status: RecoveryAttemptStatus.COMPLETED,
        executeUserOpTx: result.hash,
      });
      return {
        attemptId: attempt._id,
        userOpTx: result.hash,
        result: result.returnValue,
      };
    } catch (error) {
      await this.attempts.update(attempt._id, {
        status: RecoveryAttemptStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
      });
      throw mapRecoveryError(error);
    }
  }

  assertAssets() {
    this.config.assertAssets();
  }
}
