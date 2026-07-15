import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeviceAuthTokenMiddleware } from './device-auth-token.middleware';
import { DeviceService } from '../../device/device.service';

describe('DeviceAuthTokenMiddleware', () => {
  let middleware: DeviceAuthTokenMiddleware;
  let jwtService: { verifyAsync: jest.Mock };
  let deviceService: { findOne: jest.Mock };

  const token = 'signed-device-token';
  const device = { _id: 'device-id', fcmToken: 'fcm-token' };

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    };
    deviceService = {
      findOne: jest.fn(),
    };

    middleware = new DeviceAuthTokenMiddleware(
      jwtService as unknown as JwtService,
      deviceService as unknown as DeviceService,
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

  it('rejects missing tokens before verification', async () => {
    const req = { headers: {} };

    await expect(middleware.use(req, {} as any, jest.fn())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
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
