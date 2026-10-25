import { ConflictException } from '@nestjs/common';
import { RecoveryAttemptService } from './recovery-attempt.service';
import { RecoveryAttemptStatus } from './recovery.types';

describe('RecoveryAttemptService', () => {
  it('creates a started attempt and rejects another active attempt', async () => {
    const active = {
      _id: 'active-id',
      owner: 'GOWNER',
      status: RecoveryAttemptStatus.PENDING,
    };
    const model = {
      findOne: jest
        .fn()
        .mockReturnValueOnce({
          sort: () => ({ exec: jest.fn().mockResolvedValue(null) }),
        })
        .mockReturnValueOnce({
          sort: () => ({ exec: jest.fn().mockResolvedValue(active) }),
        }),
      create: jest.fn().mockResolvedValue({
        _id: 'attempt-id',
        owner: 'GOWNER',
        status: RecoveryAttemptStatus.STARTED,
      }),
    };
    const service = new RecoveryAttemptService(model as never);

    await expect(service.createStarted('GOWNER')).resolves.toMatchObject({
      owner: 'GOWNER',
      status: RecoveryAttemptStatus.STARTED,
    });
    await expect(service.createStarted('GOWNER')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(model.create).toHaveBeenCalledWith({
      owner: 'GOWNER',
      status: RecoveryAttemptStatus.STARTED,
    });
  });

  it('updates an attempt and reads the latest attempt for an owner', async () => {
    const updated = {
      _id: 'attempt-id',
      owner: 'GOWNER',
      status: RecoveryAttemptStatus.PENDING,
    };
    const model = {
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(updated),
      }),
      findOne: jest.fn().mockReturnValue({
        sort: () => ({ exec: jest.fn().mockResolvedValue(updated) }),
      }),
    };
    const service = new RecoveryAttemptService(model as never);

    await expect(
      service.update('attempt-id', { status: RecoveryAttemptStatus.PENDING }),
    ).resolves.toBe(updated);
    await expect(service.latest('GOWNER')).resolves.toBe(updated);
    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      'attempt-id',
      { $set: { status: RecoveryAttemptStatus.PENDING } },
      { new: true },
    );
    expect(model.findOne).toHaveBeenCalledWith({ owner: 'GOWNER' });
  });
});
