import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';

describe('DeviceController', () => {
  let controller: DeviceController;
  let deviceService: {
    create: jest.Mock;
    updateFcmToken: jest.Mock;
    updateUser: jest.Mock;
  };

  beforeEach(async () => {
    deviceService = {
      create: jest.fn(),
      updateFcmToken: jest.fn(),
      updateUser: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceController],
      providers: [
        {
          provide: DeviceService,
          useValue: deviceService,
        },
      ],
    }).compile();

    controller = module.get<DeviceController>(DeviceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes create payload to device service', async () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const payload = {
      uniqueId: 'device-id',
      macAddress: '00:11:22:33:44:55',
      fcmToken: 'fcm-token',
      attestation: { provider: 'play_integrity', token: 'token' },
    };
    deviceService.create.mockResolvedValue('device-token');

    await controller.create(response as any, payload as any);

    expect(deviceService.create).toHaveBeenCalledWith(payload);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({ deviceToken: 'device-token' });
  });

  it('passes fcm update attestation payload to device service', async () => {
    const req = { device: { _id: 'device-id' } };
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const payload = {
      fcmToken: 'fcm-token',
      attestation: { provider: 'apple_device_check', token: 'token' },
    };
    const device = { _id: 'device-id' };
    deviceService.updateFcmToken.mockResolvedValue(device);

    await controller.updateFcmToken(
      req as any,
      response as any,
      payload as any,
    );

    expect(deviceService.updateFcmToken).toHaveBeenCalledWith(
      req.device._id,
      payload,
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ device });
  });

  it('passes user update attestation payload to device service', async () => {
    const req = {
      device: { _id: 'device-id' },
      currentUser: { _id: 'user-id' },
    };
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const payload = {
      attestation: { provider: 'play_integrity', token: 'token' },
    };
    const device = { _id: 'device-id' };
    deviceService.updateUser.mockResolvedValue(device);

    await controller.updateUser(req as any, response as any, payload as any);

    expect(deviceService.updateUser).toHaveBeenCalledWith(
      req.device,
      req.currentUser,
      payload.attestation,
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ device });
  });
});
