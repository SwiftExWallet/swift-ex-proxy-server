import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecoveryAttempt } from './schema/recovery-attempt.schema';
import { RecoveryAttemptStatus } from './recovery.types';

type RecoveryAttemptRecord = RecoveryAttempt & { _id: unknown };

const ACTIVE_STATUSES = [
  RecoveryAttemptStatus.STARTED,
  RecoveryAttemptStatus.PENDING,
  RecoveryAttemptStatus.EXECUTING,
];

export type RecoveryAttemptUpdate = Partial<
  Pick<
    RecoveryAttempt,
    | 'status'
    | 'startUserOpTx'
    | 'executeUserOpTx'
    | 'destination'
    | 'unlockAt'
    | 'error'
  >
>;

@Injectable()
export class RecoveryAttemptService {
  constructor(
    @InjectModel(RecoveryAttempt.name)
    private readonly attemptModel: Model<RecoveryAttempt>,
  ) {}

  async createStarted(owner: string): Promise<RecoveryAttemptRecord> {
    const active = await this.attemptModel
      .findOne({ owner, status: { $in: ACTIVE_STATUSES } })
      .sort({ createdAt: -1 })
      .exec();
    if (active) {
      throw new ConflictException('recovery already pending for this owner');
    }

    return this.attemptModel.create({
      owner,
      status: RecoveryAttemptStatus.STARTED,
    }) as Promise<RecoveryAttemptRecord>;
  }

  update(id: unknown, update: RecoveryAttemptUpdate) {
    return this.attemptModel
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .exec();
  }

  latest(owner: string): Promise<RecoveryAttemptRecord | null> {
    return this.attemptModel
      .findOne({ owner })
      .sort({ createdAt: -1 })
      .exec() as Promise<RecoveryAttemptRecord | null>;
  }
}
