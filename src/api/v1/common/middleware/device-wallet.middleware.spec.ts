import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DeviceWalletMiddleware } from './device-wallet.middleware';

describe('DeviceWalletMiddleware', () => {
  const walletService = {
    verifyWalletForDevice: jest.fn(),
  };

  let middleware: DeviceWalletMiddleware;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = new DeviceWalletMiddleware(walletService as any);
  });

  it('attaches the verified wallet to the request', async () => {
    const verifiedWallet = {
      _id: 'wallet-id',
      walletId: 'wallet-id',
      address: '0x3333333333333333333333333333333333333333',
      addresses: new Map([
        ['multi', '0x3333333333333333333333333333333333333333'],
      ]),
      isPrimary: true,
    };
    const req: any = {
      device: { _id: 'device-id' },
      headers: {
        'x-wallet-address': verifiedWallet.address,
      },
    };
    const next = jest.fn();
    walletService.verifyWalletForDevice.mockResolvedValue(verifiedWallet);

    await middleware.use(req, {} as any, next);

    expect(walletService.verifyWalletForDevice).toHaveBeenCalledWith(
      'device-id',
      verifiedWallet.address,
    );
    expect(req.wallet).toBe(verifiedWallet);
    expect(next).toHaveBeenCalled();
  });

  it('rejects missing wallet headers', async () => {
    const req: any = {
      device: { _id: 'device-id' },
      headers: {},
    };

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects repeated wallet address headers', async () => {
    const req: any = {
      device: { _id: 'device-id' },
      headers: {
        'x-wallet-address': [
          '0x3333333333333333333333333333333333333333',
          '0x4444444444444444444444444444444444444444',
        ],
      },
    };

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(walletService.verifyWalletForDevice).not.toHaveBeenCalled();
  });

  it('rejects comma-separated wallet address header values', async () => {
    const req: any = {
      device: { _id: 'device-id' },
      headers: {
        'x-wallet-address':
          '0x3333333333333333333333333333333333333333, 0x4444444444444444444444444444444444444444',
      },
    };

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(walletService.verifyWalletForDevice).not.toHaveBeenCalled();
  });

  it('rejects wallets that are not attached to the device', async () => {
    const req: any = {
      device: { _id: 'device-id' },
      headers: {
        'x-wallet-address': '0x3333333333333333333333333333333333333333',
      },
    };
    walletService.verifyWalletForDevice.mockResolvedValue(null);

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
