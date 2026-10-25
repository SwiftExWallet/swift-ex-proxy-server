import { BadRequestException } from '@nestjs/common';
import { RecoveryTransactionService } from './recovery-transaction.service';

describe('RecoveryTransactionService', () => {
  const owner = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  it('rejects native XLM registrations that leave less than one XLM behind', async () => {
    const chain = { prepareRegistration: jest.fn() };
    const registrations = {};
    const attempts = {};
    const config = { recovery: { registrationFloor: 0n } };
    const service = new (RecoveryTransactionService as any)(
      chain,
      registrations,
      attempts,
      config,
    );

    await expect(
      service.prepareRegistration(owner, 'user@example.com', [
        { type: 'native', floor: '0' },
      ]),
    ).rejects.toThrow(new BadRequestException('native XLM floor must be at least 10000000 stroops'));
  });
});
