import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Device } from './schema/device.schema';
import { DeviceRepository } from './device.repository';
import mongoose from 'mongoose';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { User } from '../users/schema/user.schema';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    private readonly deviceRepo: DeviceRepository,
    private readonly jwtService: JwtService,
  ) {}

  async create(createDeviceDto: CreateDeviceDto): Promise<string> {
    const { uniqueId, fcmToken } = createDeviceDto;
    let device: Device | null = await this.deviceRepo.findOne({ uniqueId });
    if (device) {
      this.logger.log('==== updating fcm token ===');
      await this.deviceRepo.updateFcmToken(device._id, fcmToken);
    } else {
      this.logger.log('==== device creating ===');
      device = await this.deviceRepo.create(createDeviceDto);
    }
    this.logger.log('==== returning device token ===');
    return this.jwtService.sign(
      { _id: device?._id },
      {
        ...(process.env.JWT_ISSUER ? { issuer: process.env.JWT_ISSUER } : {}),
        ...(process.env.JWT_AUDIENCE
          ? { audience: process.env.JWT_AUDIENCE }
          : {}),
      },
    );
  }

  async updateFcmToken(
    _id: mongoose.Schema.Types.ObjectId,
    updateFcmToken: UpdateFcmTokenDto,
  ): Promise<Device | null> {
    const { fcmToken } = updateFcmToken;
    const device: Device | null = await this.deviceRepo.findOne({ _id });
    this.logger.log('==== updating user fcm start===');
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    this.logger.log('==== updating user fcm end===');
    return this.deviceRepo.updateFcmToken(device._id, fcmToken);
  }

  async updateUser(device: Device, user: User): Promise<Device | null> {
    this.logger.log('==== updating user ===');
    return this.deviceRepo.updateUser(device._id, user._id);
  }

  findOne(_id: mongoose.Schema.Types.ObjectId): Promise<Device | null> {
    return this.deviceRepo.findOne({ _id });
  }

  findOneByUniqueId(uniqueId: string): Promise<Device | null> {
    return this.deviceRepo.findOne({ uniqueId });
  }
}
