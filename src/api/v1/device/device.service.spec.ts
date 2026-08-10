import { JwtService } from '@nestjs/jwt';
import { DeviceRepository } from './device.repository';
import { DeviceService } from './device.service';

describe('DeviceService', () => {
  let service: DeviceService;
  let deviceRepo: jest.Mocked<Pick<DeviceRepository, 'findOne' | 'create'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;

  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;

  beforeEach(() => {
    process.env.JWT_ISSUER = 'swift-ex-proxy-server';
    process.env.JWT_AUDIENCE = 'swift-ex-mobile-app';
    deviceRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('device-token'),
    };

    service = new DeviceService(
      deviceRepo as unknown as DeviceRepository,
      jwtService as unknown as JwtService,
    );
  });

  afterAll(() => {
    if (issuer === undefined) {
      delete process.env.JWT_ISSUER;
    } else {
      process.env.JWT_ISSUER = issuer;
    }
    if (audience === undefined) {
      delete process.env.JWT_AUDIENCE;
    } else {
      process.env.JWT_AUDIENCE = audience;
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('signs device token with configured issuer and audience', async () => {
    const createDeviceDto = {
      brand: 'Apple',
      model: 'iPhone',
      uniqueId: 'device-1',
      type: 'ios',
      macAddress: '00:11:22:33:44:55',
      fcmToken: 'fcm-token',
    };
    const device = { _id: 'device-id' };
    deviceRepo.findOne.mockResolvedValue(null);
    deviceRepo.create.mockResolvedValue(device as any);

    await expect(service.create(createDeviceDto)).resolves.toBe('device-token');

    expect(jwtService.sign).toHaveBeenCalledWith(
      { _id: device._id },
      {
        issuer: 'swift-ex-proxy-server',
        audience: 'swift-ex-mobile-app',
      },
    );
  });

  it('omits issuer and audience when they are not configured', async () => {
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    const createDeviceDto = {
      brand: 'Apple',
      model: 'iPhone',
      uniqueId: 'device-1',
      type: 'ios',
      macAddress: '00:11:22:33:44:55',
      fcmToken: 'fcm-token',
    };
    const device = { _id: 'device-id' };
    deviceRepo.findOne.mockResolvedValue(null);
    deviceRepo.create.mockResolvedValue(device as any);

    await service.create(createDeviceDto);

    expect(jwtService.sign).toHaveBeenCalledWith(
      { _id: device._id },
      expect.any(Object),
    );
    expect(Object.keys(jwtService.sign.mock.calls[0][1] as object)).toEqual([]);
  });
});
