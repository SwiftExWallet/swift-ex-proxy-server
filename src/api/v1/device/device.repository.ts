import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { CreateDeviceDto } from './dto/create-device.dto';
import { Device } from './schema/device.schema';
import { DeviceAttestationMetadata } from './device-attestation.service';

@Injectable()
export class DeviceRepository {
  constructor(
    @InjectModel(Device.name)
    private deviceModel: Model<Device>,
  ) {}

  async findOne(cond: Record<string, any>): Promise<Device | null> {
    return await this.deviceModel.findOne(cond);
  }

  async create(
    createDeviceDto: CreateDeviceDto,
    attestation?: DeviceAttestationMetadata,
  ): Promise<Device> {
    const devicePayload = { ...createDeviceDto };
    delete devicePayload.attestation;
    const createdDevice = new this.deviceModel({
      ...devicePayload,
      ...attestation,
    });
    return createdDevice.save();
  }

  updateFcmToken(
    _id: mongoose.Schema.Types.ObjectId,
    fcmToken: string,
    attestation?: DeviceAttestationMetadata,
  ): Promise<Device | null> {
    return this.deviceModel.findByIdAndUpdate(
      { _id },
      { $set: { fcmToken, ...attestation } },
      { new: true },
    );
  }

  updateUser(
    _id: mongoose.Schema.Types.ObjectId,
    userId: mongoose.Schema.Types.ObjectId,
    attestation?: DeviceAttestationMetadata,
  ): Promise<Device | null> {
    return this.deviceModel.findByIdAndUpdate(
      { _id },
      { $set: { userId, ...attestation } },
      { new: true },
    );
  }
}
