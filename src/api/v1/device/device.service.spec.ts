import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import { DeviceRepository } from './device.repository';
import {
  DeviceAttestationMetadata,
  DeviceAttestationService,
} from './device-attestation.service';
import { DeviceAttestationProvider } from './dto/device-attestation.dto';
import { DeviceService } from './device.service';

describe('DeviceService', () => {
  let service: DeviceService;
  let deviceRepo: jest.Mocked<
    Pick<
      DeviceRepository,
      'findOne' | 'create' | 'updateFcmToken' | 'updateUser'
    >
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;
  let attestationService: jest.Mocked<Pick<DeviceAttestationService, 'verify'>>;

  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;
  const attestationMetadata: DeviceAttestationMetadata = {
    attestationProvider: DeviceAttestationProvider.PLAY_INTEGRITY,
    attestationStatus: 'verified',
    attestationVerifiedAt: new Date('2026-08-19T00:00:00.000Z'),
    attestationPackageName: 'com.swiftex.app',
    attestationDeviceVerdict: ['MEETS_DEVICE_INTEGRITY'],
  };

  beforeEach(() => {
    process.env.JWT_ISSUER = 'swift-ex-proxy-server';
    process.env.JWT_AUDIENCE = 'swift-ex-mobile-app';
    deviceRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      updateFcmToken: jest.fn(),
      updateUser: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('device-token'),
    };
    attestationService = {
      verify: jest.fn().mockResolvedValue(undefined),
    };

    service = new DeviceService(
      deviceRepo as unknown as DeviceRepository,
      jwtService as unknown as JwtService,
      attestationService as unknown as DeviceAttestationService,
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

  it('verifies attestation before creating a device', async () => {
    const createDeviceDto = {
      brand: 'Samsung',
      model: 'Galaxy',
      uniqueId: 'device-1',
      type: 'android',
      macAddress: '00:11:22:33:44:55',
      fcmToken: 'fcm-token',
      attestation: {
        provider: DeviceAttestationProvider.PLAY_INTEGRITY,
        token: 'integrity-token',
        nonce: 'nonce-1',
      },
    };
    const device = { _id: 'device-id' };
    attestationService.verify.mockResolvedValue(attestationMetadata);
    deviceRepo.findOne.mockResolvedValue(null);
    deviceRepo.create.mockResolvedValue(device as any);

    await expect(service.create(createDeviceDto)).resolves.toBe('device-token');

    expect(attestationService.verify).toHaveBeenCalledWith(
      createDeviceDto.attestation,
      createDeviceDto.type,
    );
    expect(deviceRepo.create).toHaveBeenCalledWith(
      createDeviceDto,
      attestationMetadata,
    );
  });

  it('verifies attestation before updating an existing device through create', async () => {
    const createDeviceDto = {
      brand: 'Apple',
      model: 'iPhone',
      uniqueId: 'device-1',
      type: 'ios',
      macAddress: '00:11:22:33:44:55',
      fcmToken: 'new-fcm-token',
      attestation: {
        provider: DeviceAttestationProvider.APPLE_DEVICE_CHECK,
        token: 'apple-device-token',
      },
    };
    const device = { _id: 'device-id' };
    attestationService.verify.mockResolvedValue(attestationMetadata);
    deviceRepo.findOne.mockResolvedValue(device as any);

    await expect(service.create(createDeviceDto)).resolves.toBe('device-token');

    expect(deviceRepo.updateFcmToken).toHaveBeenCalledWith(
      device._id,
      createDeviceDto.fcmToken,
      attestationMetadata,
    );
    expect(deviceRepo.create).not.toHaveBeenCalled();
  });

  it('verifies attestation before updating fcm token', async () => {
    const device = { _id: 'device-id' };
    const dto = {
      fcmToken: 'new-fcm-token',
      attestation: {
        provider: DeviceAttestationProvider.PLAY_INTEGRITY,
        token: 'integrity-token',
      },
    };
    attestationService.verify.mockResolvedValue(attestationMetadata);
    deviceRepo.findOne.mockResolvedValue(device as any);
    deviceRepo.updateFcmToken.mockResolvedValue(device as any);

    await expect(service.updateFcmToken(device._id as any, dto)).resolves.toBe(
      device,
    );

    expect(attestationService.verify).toHaveBeenCalledWith(dto.attestation);
    expect(deviceRepo.updateFcmToken).toHaveBeenCalledWith(
      device._id,
      dto.fcmToken,
      attestationMetadata,
    );
  });

  it('verifies attestation before updating user on a device', async () => {
    const device = { _id: 'device-id' };
    const user = { _id: 'user-id' };
    const attestation = {
      provider: DeviceAttestationProvider.APPLE_DEVICE_CHECK,
      token: 'apple-device-token',
    };
    attestationService.verify.mockResolvedValue(attestationMetadata);
    deviceRepo.updateUser.mockResolvedValue(device as any);

    await expect(
      service.updateUser(device as any, user as any, attestation),
    ).resolves.toBe(device);

    expect(attestationService.verify).toHaveBeenCalledWith(attestation);
    expect(deviceRepo.updateUser).toHaveBeenCalledWith(
      device._id,
      user._id,
      attestationMetadata,
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
