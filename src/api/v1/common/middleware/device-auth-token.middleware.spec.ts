import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeviceAuthTokenMiddleware } from './device-auth-token.middleware';
import { DeviceService } from '../../device/device.service';
import { WalletService } from '../../wallet/wallet.service';

describe('DeviceAuthTokenMiddleware', () => {
  let middleware: DeviceAuthTokenMiddleware;
  let jwtService: { verifyAsync: jest.Mock };
  let deviceService: { findOne: jest.Mock };
  let walletService: { verifyWalletForDevice: jest.Mock };

  const token = 'signed-device-token';
  const walletToken = 'signed-wallet-token';
  const device = { _id: 'device-id', fcmToken: 'fcm-token' };
  const requestWallet = {
    multi: '0x3333333333333333333333333333333333333333',
    xlm: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  };

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    };
    deviceService = {
      findOne: jest.fn(),
    };
    walletService = {
      verifyWalletForDevice: jest.fn(),
    };

    middleware = new DeviceAuthTokenMiddleware(
      jwtService as unknown as JwtService,
      deviceService as unknown as DeviceService,
      walletService as unknown as WalletService,
    );
  });

  afterEach(() => {
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    jest.restoreAllMocks();
  });

  function requestWithToken(value: unknown = token): any {
    return {
      headers: {
        'x-auth-device-token': value,
      },
    };
  }

  function walletScopedRequestWithDeviceToken(
    walletAddress = requestWallet.multi,
  ): any {
    return {
      originalUrl: '/api/v1/quoter/quote',
      headers: {
        'x-auth-device-token': token,
        'x-wallet-address': walletAddress,
      },
    };
  }

  function requestWithWalletToken(value: unknown = walletToken): any {
    return {
      originalUrl: '/api/v1/quoter/quote',
      headers: {
        'x-auth-wallet-token': value,
      },
    };
  }

  function publicRequest(headers: Record<string, unknown> = {}): any {
    return {
      method: 'GET',
      originalUrl: '/api/v1/market-data/prices',
      headers,
    };
  }

  it('sets req.device from a verified token payload', async () => {
    const req = requestWithToken();
    const next = jest.fn();
    jwtService.verifyAsync.mockResolvedValue({
      _id: device._id,
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    deviceService.findOne.mockResolvedValue(device);

    await middleware.use(req, {} as any, next);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith(token, {});
    expect(deviceService.findOne).toHaveBeenCalledWith(device._id);
    expect(req.device).toBe(device);
    expect(req.wallet).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets req.device and req.wallet for device-token wallet-scoped requests', async () => {
    const req = walletScopedRequestWithDeviceToken();
    const next = jest.fn();
    jwtService.verifyAsync.mockResolvedValue({
      _id: device._id,
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    deviceService.findOne.mockResolvedValue(device);
    walletService.verifyWalletForDevice.mockResolvedValue({
      _id: 'wallet-id',
      addresses: new Map([
        ['multi', requestWallet.multi],
        ['xlm', requestWallet.xlm],
      ]),
    });

    await middleware.use(req, {} as any, next);

    expect(deviceService.findOne).toHaveBeenCalledWith(device._id);
    expect(walletService.verifyWalletForDevice).toHaveBeenCalledWith(
      device._id,
      requestWallet.multi,
    );
    expect(req.device).toBe(device);
    expect(req.wallet).toEqual(requestWallet);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects device-token wallet-scoped requests without wallet address', async () => {
    const req = {
      originalUrl: '/api/v1/quoter/quote',
      headers: {
        'x-auth-device-token': token,
      },
    };
    jwtService.verifyAsync.mockResolvedValue({
      _id: device._id,
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    deviceService.findOne.mockResolvedValue(device);

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(walletService.verifyWalletForDevice).not.toHaveBeenCalled();
  });

  it('rejects device-token wallet-scoped requests when wallet is not attached to the device', async () => {
    const req = walletScopedRequestWithDeviceToken();
    jwtService.verifyAsync.mockResolvedValue({
      _id: device._id,
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    deviceService.findOne.mockResolvedValue(device);
    walletService.verifyWalletForDevice.mockResolvedValue(null);

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(HttpException);
    expect(walletService.verifyWalletForDevice).toHaveBeenCalledWith(
      device._id,
      requestWallet.multi,
    );
  });

  it('sets req.wallet from a verified wallet token payload', async () => {
    const req = requestWithWalletToken();
    const next = jest.fn();
    jwtService.verifyAsync.mockResolvedValue(requestWallet);

    await middleware.use(req, {} as any, next);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith(walletToken, {});
    expect(deviceService.findOne).not.toHaveBeenCalled();
    expect(req.wallet).toEqual(requestWallet);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('attaches wallet token context alongside optional device context', async () => {
    const req = {
      originalUrl: '/api/v1/quoter/quote',
      headers: {
        'x-auth-device-token': token,
        'x-auth-wallet-token': walletToken,
      },
    } as any;
    const next = jest.fn();
    jwtService.verifyAsync.mockImplementation((receivedToken) => {
      if (receivedToken === token) {
        return Promise.resolve({
          _id: device._id,
          exp: Math.floor(Date.now() / 1000) + 60,
        });
      }

      return Promise.resolve(requestWallet);
    });
    deviceService.findOne.mockResolvedValue(device);

    await middleware.use(req, {} as any, next);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith(token, {});
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(walletToken, {});
    expect(jwtService.verifyAsync).toHaveBeenCalledTimes(2);
    expect(req.device).toBe(device);
    expect(req.wallet).toEqual(requestWallet);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid wallet tokens before device lookup', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(
      middleware.use(requestWithWalletToken(), {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(deviceService.findOne).not.toHaveBeenCalled();
  });

  it('attaches wallet tokens outside wallet-required routes when supplied', async () => {
    const req = publicRequest({ 'x-auth-wallet-token': walletToken });
    const next = jest.fn();
    jwtService.verifyAsync.mockResolvedValue(requestWallet);

    await middleware.use(req, {} as any, next);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith(walletToken, {});
    expect(deviceService.findOne).not.toHaveBeenCalled();
    expect(req.wallet).toEqual(requestWallet);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes configured issuer and audience to JWT verification', async () => {
    process.env.JWT_ISSUER = 'swift-ex';
    process.env.JWT_AUDIENCE = 'swift-ex-device';
    const req = requestWithToken();
    jwtService.verifyAsync.mockResolvedValue({
      _id: device._id,
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    deviceService.findOne.mockResolvedValue(device);

    await middleware.use(req, {} as any, jest.fn());

    expect(jwtService.verifyAsync).toHaveBeenCalledWith(token, {
      issuer: 'swift-ex',
      audience: 'swift-ex-device',
    });
  });

  it('passes public requests without auth context', async () => {
    const req = publicRequest();
    const next = jest.fn();

    await middleware.use(req, {} as any, next);

    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(deviceService.findOne).not.toHaveBeenCalled();
    expect(req.device).toBeUndefined();
    expect(req.wallet).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('requires wallet context on wallet-scoped routes', async () => {
    const req = { originalUrl: '/api/v1/quoter/quote', headers: {} };

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(deviceService.findOne).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated EVM requests', async () => {
    const req = {
      originalUrl: '/api/v1/evm/base/transaction/prepare',
      headers: {},
    };

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('requires device context on device-owned update routes', async () => {
    const req = {
      method: 'PATCH',
      originalUrl: '/api/v1/device/update-fcm-token',
      headers: {},
    };

    await expect(
      middleware.use(req, {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    expect(deviceService.findOne).not.toHaveBeenCalled();
  });

  it('rejects forged or expired tokens before device lookup', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(
      middleware.use(requestWithToken(), {} as any, jest.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(deviceService.findOne).not.toHaveBeenCalled();
  });

  it('rejects verified payloads without an expiration', async () => {
    jwtService.verifyAsync.mockResolvedValue({ _id: device._id });

    await expect(
      middleware.use(requestWithToken(), {} as any, jest.fn()),
    ).rejects.toMatchObject({
      message: 'Invalid Device',
    });
    expect(deviceService.findOne).not.toHaveBeenCalled();
  });

  it('rejects unknown devices after token verification', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      _id: device._id,
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    deviceService.findOne.mockResolvedValue(null);

    try {
      await middleware.use(requestWithToken(), {} as any, jest.fn());
      fail('Expected middleware to reject unknown device');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });
});
