import { WalletSyncFailedService } from './wallet-sync-failed.service';

describe('WalletSyncFailedService', () => {
  it('persists deviceId when marking a wallet sync failure', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 'failed-wallet-id' });
    const service = new WalletSyncFailedService({ create } as any);
    const payload = {
      userId: 'user-id',
      deviceId: 'device-id',
      addresses: {
        multi: '0x1234567890123456789012345678901234567890',
        xlm: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      syncError: 'listener failed',
    };

    await service.markWalletAsSyncFailed(payload as any);

    expect(create).toHaveBeenCalledWith(payload);
  });
});
