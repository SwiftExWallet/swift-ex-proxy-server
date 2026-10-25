import { RecoveryService } from './recovery.service';
import { RecoveryAttemptStatus } from './recovery.types';

describe('RecoveryService', () => {
  const owner = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const eml = Buffer.from(
    'DKIM-Signature: v=1; d=example.com; s=test\r\n\r\nbody',
  );

  function createService() {
    const chain = {
      assertConfiguredVerifier: jest.fn().mockResolvedValue(undefined),
      registration: jest.fn().mockResolvedValue({ commitment: 'c', salt: '1' }),
      pending: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({
        destination: 'DESTINATION',
        unlockAt: 100n,
        startedAt: 90n,
        nullifier: 'nullifier',
      }),
      previewDestination: jest.fn().mockResolvedValue('DESTINATION'),
      startRecovery: jest.fn().mockResolvedValue({ hash: 'start-tx' }),
      executeRecovery: jest.fn().mockResolvedValue({
        hash: 'execute-tx',
        returnValue: 'ok',
      }),
    };
    const proofs = {
      prove: jest.fn().mockResolvedValue({
        publicInputs: ['input'],
        proof: { a: 'a', b: 'b', c: 'c' },
      }),
    };
    const attempts = {
      createStarted: jest.fn().mockResolvedValue({ _id: 'attempt-id' }),
      update: jest.fn().mockResolvedValue(undefined),
      latest: jest.fn(),
    };
    const config = { assertAssets: jest.fn() };
    const service = new RecoveryService(
      chain as never,
      proofs as never,
      config as never,
      attempts as never,
    );
    return { service, chain, proofs, attempts };
  }

  it('persists STARTED then PENDING when recovery starts', async () => {
    const { service, attempts } = createService();

    await expect(service.start(owner, eml)).resolves.toMatchObject({
      userOpTx: 'start-tx',
      destination: 'DESTINATION',
      unlockAt: 100n,
    });

    expect(attempts.createStarted).toHaveBeenCalledWith(owner);
    expect(attempts.update).toHaveBeenCalledWith('attempt-id', {
      status: RecoveryAttemptStatus.PENDING,
      startUserOpTx: 'start-tx',
      destination: 'DESTINATION',
      unlockAt: '100',
    });
  });

  it('marks an attempt FAILED when recovery start fails', async () => {
    const { service, chain, attempts } = createService();
    chain.startRecovery.mockRejectedValue(new Error('chain rejected'));

    await expect(service.start(owner, eml)).rejects.toThrow(
      'recovery proof rejected: chain rejected',
    );
    expect(attempts.update).toHaveBeenCalledWith('attempt-id', {
      status: RecoveryAttemptStatus.FAILED,
      error: 'chain rejected',
    });
  });

  it('persists EXECUTING then COMPLETED when recovery executes', async () => {
    const { service, attempts } = createService();
    attempts.latest.mockResolvedValue({
      _id: 'attempt-id',
      owner,
      status: RecoveryAttemptStatus.PENDING,
    });

    await expect(service.execute(owner)).resolves.toEqual({
      attemptId: 'attempt-id',
      userOpTx: 'execute-tx',
      result: 'ok',
    });
    expect(attempts.update).toHaveBeenNthCalledWith(1, 'attempt-id', {
      status: RecoveryAttemptStatus.EXECUTING,
    });
    expect(attempts.update).toHaveBeenNthCalledWith(2, 'attempt-id', {
      status: RecoveryAttemptStatus.COMPLETED,
      executeUserOpTx: 'execute-tx',
    });
  });

  it('returns the latest attempt from the database for status', async () => {
    const { service, attempts, chain } = createService();
    const latest = { owner, status: RecoveryAttemptStatus.PENDING };
    attempts.latest.mockResolvedValue(latest);

    await expect(service.status(owner)).resolves.toBe(latest);
    expect(chain.pending).not.toHaveBeenCalled();
  });

  it('marks an attempt FAILED when recovery execution fails', async () => {
    const { service, chain, attempts } = createService();
    attempts.latest.mockResolvedValue({
      _id: 'attempt-id',
      owner,
      status: RecoveryAttemptStatus.PENDING,
    });
    chain.executeRecovery.mockRejectedValue(new Error('execute rejected'));

    await expect(service.execute(owner)).rejects.toThrow(
      'recovery proof rejected: execute rejected',
    );
    expect(attempts.update).toHaveBeenNthCalledWith(2, 'attempt-id', {
      status: RecoveryAttemptStatus.FAILED,
      error: 'execute rejected',
    });
  });
});
