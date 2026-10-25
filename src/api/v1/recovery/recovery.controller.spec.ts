import { BadRequestException } from '@nestjs/common';
import { RecoveryController } from './recovery.controller';

describe('RecoveryController', () => {
  const service = {
    start: jest.fn(),
    status: jest.fn(),
    execute: jest.fn(),
    register: jest.fn(),
  };
  const registrations = { register: jest.fn() };
  const transactions = {
    prepareRegistration: jest.fn(),
    confirmRegistration: jest.fn(),
    prepareCancellation: jest.fn(),
    confirmCancellation: jest.fn(),
  };
  const notifications = { sendNotification: jest.fn() };
  const controller = new RecoveryController(
    service as never,
    registrations as never,
    notifications as never,
    transactions as never,
  );
  const owner = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  beforeEach(() => jest.clearAllMocks());

  it('rejects a recovery request for a wallet other than the authenticated wallet', async () => {
    await expect(
      controller.start(
        {buffer: Buffer.from('eml')},
        owner,
        {wallet: {xlm: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'}},
      ),
    ).rejects.toThrow(BadRequestException);
    expect(service.start).not.toHaveBeenCalled();
  });

  it('passes an authenticated owner and uploaded email to the service', async () => {
    service.start.mockResolvedValue({userOpTx: 'tx'});
    const file = {buffer: Buffer.from('eml')};
    await expect(
      controller.start(file, owner, {
        wallet: {xlm: owner},
        device: {fcmToken: 'fcm-token'},
      }),
    ).resolves.toEqual({userOpTx: 'tx'});
    expect(service.start).toHaveBeenCalledWith(owner, file.buffer);
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'fcm-token',
      expect.objectContaining({title: 'Recovery started'}),
    );
  });

  it('notifies after recovery execution succeeds', async () => {
    service.execute.mockResolvedValue({userOpTx: 'tx'});

    await expect(
      controller.execute(
        {owner},
        {wallet: {xlm: owner}, device: {fcmToken: 'fcm-token'}},
      ),
    ).resolves.toEqual({userOpTx: 'tx'});

    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'fcm-token',
      expect.objectContaining({title: 'Recovery completed'}),
    );
  });

  it('saves registration metadata using the authenticated device context', async () => {
    registrations.register.mockResolvedValue({ walletAddress: owner });
    const device = { uniqueId: 'device-unique-id', fcmToken: 'fcm-token' };

    await expect(
      controller.register(
        { email: ' User@Example.com ', walletAddress: owner },
        { wallet: { xlm: owner }, device },
      ),
    ).resolves.toEqual({ walletAddress: owner });

    expect(registrations.register).toHaveBeenCalledWith(
      ' User@Example.com ',
      owner,
      device,
    );
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'fcm-token',
      expect.objectContaining({title: 'Recovery enabled'}),
    );
  });

  it('rejects registration metadata for a different wallet', async () => {
    await expect(
      controller.register(
        { email: 'user@example.com', walletAddress: owner },
        {
          wallet: {
            xlm: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          },
          device: { uniqueId: 'device', fcmToken: 'fcm' },
        },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(registrations.register).not.toHaveBeenCalled();
  });

  it('prepares an unsigned owner-signed registration transaction without saving metadata', async () => {
    transactions.prepareRegistration.mockResolvedValue({unsignedXdr: 'AAAA'});
    const device = {uniqueId: 'device', fcmToken: 'fcm'};
    const assets = [{type: 'native' as const, code: 'XLM', floor: '0'}];

    await expect(
      controller.prepareRegistration(
        {email: 'user@example.com', walletAddress: owner, assets},
        {wallet: {xlm: owner}, device},
      ),
    ).resolves.toEqual({unsignedXdr: 'AAAA'});

    expect(transactions.prepareRegistration).toHaveBeenCalledWith(
      owner,
      'user@example.com',
      assets,
    );
    expect(registrations.register).not.toHaveBeenCalled();
  });

  it('confirms registration only after the backend validates the finalized transaction', async () => {
    transactions.confirmRegistration.mockResolvedValue({walletAddress: owner});
    const device = {uniqueId: 'device', fcmToken: 'fcm'};

    await controller.confirmRegistration(
      {email: 'user@example.com', walletAddress: owner, transactionHash: 'abc'},
      {wallet: {xlm: owner}, device},
    );

    expect(transactions.confirmRegistration).toHaveBeenCalledWith(
      owner,
      'user@example.com',
      'abc',
      device,
    );
  });
});
