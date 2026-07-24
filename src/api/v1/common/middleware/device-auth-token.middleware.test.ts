import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DeviceService } from '../../device/device.service';
import { DeviceAuthTokenMiddleware } from './device-auth-token.middleware';

const mockJwtService = { decode: jest.fn() };
const mockDeviceService = { findOne: jest.fn() };

describe('DeviceAuthTokenMiddleware', () => {
  let middleware: DeviceAuthTokenMiddleware;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceAuthTokenMiddleware,
        { provide: JwtService, useValue: mockJwtService },
        { provide: DeviceService, useValue: mockDeviceService },
      ],
    }).compile();

    middleware = module.get<DeviceAuthTokenMiddleware>(
      DeviceAuthTokenMiddleware,
    );
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('throws NotFoundException when x-auth-device-token header is missing', async () => {
    const req: any = { headers: {}, originalUrl: '/api/test' };
    const next = jest.fn();

    await expect(middleware.use(req, {} as any, next)).rejects.toThrow(
      NotFoundException,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('throws HttpException FORBIDDEN when decoded token has no _id', async () => {
    mockJwtService.decode.mockReturnValue({ sub: 'no-id' });
    const req: any = {
      headers: { 'x-auth-device-token': 'bad.token' },
      originalUrl: '/api/test',
    };
    const next = jest.fn();

    await expect(middleware.use(req, {} as any, next)).rejects.toThrow(
      new HttpException('Invalid Device', HttpStatus.FORBIDDEN),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('throws HttpException FORBIDDEN when device not found in DB', async () => {
    mockJwtService.decode.mockReturnValue({ _id: 'device-id-123' });
    mockDeviceService.findOne.mockResolvedValue(null);
    const req: any = {
      headers: { 'x-auth-device-token': 'valid.token' },
      originalUrl: '/api/test',
    };
    const next = jest.fn();

    await expect(middleware.use(req, {} as any, next)).rejects.toThrow(
      new HttpException('Invalid Device', HttpStatus.FORBIDDEN),
    );
  });

  it('attaches device to req and calls next when token is valid', async () => {
    const device = { _id: 'device-id-123', fcmToken: 'tok' };
    mockJwtService.decode.mockReturnValue({ _id: 'device-id-123' });
    mockDeviceService.findOne.mockResolvedValue(device);
    const req: any = {
      headers: { 'x-auth-device-token': 'valid.token' },
      originalUrl: '/api/test',
    };
    const next = jest.fn();

    await middleware.use(req, {} as any, next);

    expect(req.device).toEqual(device);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
