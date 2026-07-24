import { Test, TestingModule } from '@nestjs/testing';
import { DeviceService } from './device.service';
import { DeviceRepository } from './device.repository';
import mongoose from 'mongoose';

const mockDeviceRepo = { findOne: jest.fn() };

describe('DeviceService', () => {
  let service: DeviceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        { provide: DeviceRepository, useValue: mockDeviceRepo },
      ],
    }).compile();

    service = module.get<DeviceService>(DeviceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('delegates to repo with _id condition', async () => {
      const id = new mongoose.Types.ObjectId() as any;
      const device = { _id: id, uniqueId: 'device-abc', fcmToken: 'token-xyz' };
      mockDeviceRepo.findOne.mockResolvedValue(device);

      const result = await service.findOne(id);
      expect(mockDeviceRepo.findOne).toHaveBeenCalledWith({ _id: id });
      expect(result).toEqual(device);
    });

    it('returns null when device not found', async () => {
      mockDeviceRepo.findOne.mockResolvedValue(null);
      expect(
        await service.findOne(new mongoose.Types.ObjectId() as any),
      ).toBeNull();
    });
  });
});
