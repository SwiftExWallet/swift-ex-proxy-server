import { SesHookController } from './ses-hook.controller';

describe('SesHookController', () => {
  const eml = Buffer.from(
    'DKIM-Signature: v=1; d=example.com; s=test\r\n\r\nbody',
  );

  it('confirms an SNS subscription', async () => {
    const recovery = { start: jest.fn() };
    const registrations = { findByEmail: jest.fn() };
    const controller = new SesHookController(
      recovery as never,
      registrations as never,
    );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      controller.handle({
        Type: 'SubscriptionConfirmation',
        SubscribeURL: 'https://sns.example/confirm',
      }),
    ).resolves.toEqual({ statusCode: 200 });

    expect(fetchMock).toHaveBeenCalledWith('https://sns.example/confirm');
    expect(recovery.start).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('acknowledges an SES notification and starts recovery for the registered sender', async () => {
    const registration = { walletAddress: 'GOWNER' };
    const recovery = {
      start: jest.fn().mockResolvedValue({ userOpTx: '0x1' }),
    };
    const registrations = {
      findByEmail: jest.fn().mockResolvedValue(registration),
    };
    const controller = new SesHookController(
      recovery as never,
      registrations as never,
    );
    const message = {
      mail: { source: ' User@Example.com ' },
      content: eml.toString('base64'),
    };

    await expect(
      controller.handle({
        Type: 'Notification',
        Message: JSON.stringify(message),
      }),
    ).resolves.toEqual({ statusCode: 200 });

    await Promise.resolve();
    expect(registrations.findByEmail).toHaveBeenCalledWith('User@Example.com');
    expect(recovery.start).toHaveBeenCalledWith('GOWNER', eml);
  });

  it('accepts an already-parsed SNS notification body', async () => {
    const recovery = { start: jest.fn().mockResolvedValue(undefined) };
    const registrations = {
      findByEmail: jest.fn().mockResolvedValue({ walletAddress: 'GOWNER' }),
    };
    const controller = new SesHookController(
      recovery as never,
      registrations as never,
    );
    const message = {
      mail: { source: 'user@example.com' },
      content: eml.toString('base64'),
    };

    await expect(
      controller.handle({ Type: 'Notification', Message: message }),
    ).resolves.toEqual({ statusCode: 200 });
    await Promise.resolve();

    expect(recovery.start).toHaveBeenCalledWith('GOWNER', eml);
  });

  it('does not start recovery when the sender is not registered', async () => {
    const recovery = { start: jest.fn() };
    const registrations = { findByEmail: jest.fn().mockResolvedValue(null) };
    const controller = new SesHookController(
      recovery as never,
      registrations as never,
    );

    await expect(
      controller.handle({
        Type: 'Notification',
        Message: JSON.stringify({
          mail: { source: 'unknown@example.com' },
          content: eml.toString('base64'),
        }),
      }),
    ).resolves.toEqual({ statusCode: 200 });
    await Promise.resolve();

    expect(recovery.start).not.toHaveBeenCalled();
  });

  it('logs SES receipt and successful recovery processing', async () => {
    const recovery = {
      start: jest.fn().mockResolvedValue({ userOpTx: '0x1' }),
    };
    const registrations = {
      findByEmail: jest.fn().mockResolvedValue({ walletAddress: 'GOWNER' }),
    };
    const controller = new SesHookController(
      recovery as never,
      registrations as never,
    );
    const log = jest.spyOn((controller as any).logger, 'log');

    await controller.handle({
      Type: 'Notification',
      Message: JSON.stringify({
        mail: { source: 'user@example.com' },
        content: eml.toString('base64'),
      }),
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(log).toHaveBeenCalledWith(
      'SES hook received notification for sender user@example.com',
    );
    expect(log).toHaveBeenCalledWith('SES recovery started for wallet GOWNER');
    log.mockRestore();
  });

  it('rejects malformed SNS notifications', async () => {
    const controller = new SesHookController(
      { start: jest.fn() } as never,
      { findByEmail: jest.fn() } as never,
    );

    await expect(controller.handle({ Type: 'Notification' })).rejects.toThrow(
      'SNS notification Message is required',
    );
  });
});
