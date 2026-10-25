import { RecoveryRegistrationService } from './recovery-registration.service';

describe('RecoveryRegistrationService', () => {
  it('finds a registration by normalized email', async () => {
    const registration = { walletAddress: 'GOWNER' };
    const model = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(registration),
      }),
    };
    const service = new RecoveryRegistrationService(model as never);

    await expect(service.findByEmail(' User@Example.com ')).resolves.toBe(
      registration,
    );

    expect(model.findOne).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  it('upserts registration metadata by unique wallet address', async () => {
    const registration = { walletAddress: 'GOWNER' };
    const model = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(registration),
      }),
    };
    const service = new RecoveryRegistrationService(model as never);
    const device = { uniqueId: 'device-unique-id', fcmToken: 'fcm-token' };

    await expect(
      service.register(' User@Example.com ', 'GOWNER', device as never),
    ).resolves.toBe(registration);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { walletAddress: 'GOWNER' },
      {
        $set: {
          email: 'user@example.com',
          walletAddress: 'GOWNER',
          deviceUniqueId: 'device-unique-id',
          fcmToken: 'fcm-token',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  });
});
