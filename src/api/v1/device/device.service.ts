import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Device } from './schema/device.schema';
import { DeviceRepository } from './device.repository';
import mongoose from 'mongoose';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { User } from '../users/schema/user.schema';
import { JwtService } from '@nestjs/jwt';
import { DeviceAttestationService } from './device-attestation.service';
import { DeviceAttestationDto } from './dto/device-attestation.dto';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    private readonly deviceRepo: DeviceRepository,
    private readonly jwtService: JwtService,
    private readonly deviceAttestationService: DeviceAttestationService,
  ) {}

  async create(createDeviceDto: CreateDeviceDto): Promise<string> {
    const { uniqueId, fcmToken } = createDeviceDto;
    const attestation = await this.deviceAttestationService.verify(
      createDeviceDto.attestation,
      createDeviceDto.type,
    );
    let device: Device | null = await this.deviceRepo.findOne({ uniqueId });
    if (device) {
      this.logger.log('==== updating fcm token ===');
      await this.deviceRepo.updateFcmToken(device._id, fcmToken, attestation);
    } else {
      this.logger.log('==== device creating ===');
      device = await this.deviceRepo.create(createDeviceDto, attestation);
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
    const attestation = await this.deviceAttestationService.verify(
      updateFcmToken.attestation,
    );
    this.logger.log('==== updating user fcm end===');
    return this.deviceRepo.updateFcmToken(device._id, fcmToken, attestation);
  }

  async updateUser(
    device: Device,
    user: User,
    attestationPayload?: DeviceAttestationDto,
  ): Promise<Device | null> {
    this.logger.log('==== updating user ===');
    const attestation =
      await this.deviceAttestationService.verify(attestationPayload);
    return this.deviceRepo.updateUser(device._id, user._id, attestation);
  }

  findOne(_id: mongoose.Schema.Types.ObjectId): Promise<Device | null> {
    return this.deviceRepo.findOne({ _id });
  }

  findOneByUniqueId(uniqueId: string): Promise<Device | null> {
    return this.deviceRepo.findOne({ uniqueId });
  }
}
