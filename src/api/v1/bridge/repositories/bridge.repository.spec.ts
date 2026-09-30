import { ConflictException, NotFoundException } from '@nestjs/common';
import { BridgeRepository } from './bridge.repository';

describe('Bridge persistence', () => {
  it('does not overwrite a concurrent state transition', async () => {
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
      }),
    };
    const repository = new BridgeRepository(model as any);
    await expect(
      repository.save({ id: 'transfer', revision: 2 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(model.findOneAndUpdate.mock.calls[0][0]).toEqual({
      id: 'transfer',
      revision: 2,
    });
  });
  it('returns 404 for an unknown transfer', async () => {
    const model = {
      findOne: () => ({
        lean: () => ({ exec: () => Promise.resolve(null) }),
      }),
    };
    await expect(
      new BridgeRepository(model as any).get('missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
