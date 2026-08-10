import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { CreateDeviceDto } from './dto/create-device.dto';
import { Device } from './schema/device.schema';

@Injectable()
export class DeviceRepository {
  constructor(
    @InjectModel(Device.name)
    private deviceModel: Model<Device>,
  ) {}

  async findOne(cond: Record<string, any>): Promise<Device | null> {
    return await this.deviceModel.findOne(cond);
  }

  async create(createDeviceDto: CreateDeviceDto): Promise<Device> {
    const createdDevice = new this.deviceModel(createDeviceDto);
    return createdDevice.save();
  }

  updateFcmToken(
    _id: mongoose.Schema.Types.ObjectId,
    fcmToken: string,
  ): Promise<Device | null> {
    return this.deviceModel.findByIdAndUpdate({ _id }, { $set: { fcmToken } });
  }

  updateUser(
    _id: mongoose.Schema.Types.ObjectId,
    userId: mongoose.Schema.Types.ObjectId,
  ): Promise<Device | null> {
    return this.deviceModel.findByIdAndUpdate({ _id }, { $set: { userId } });
  }
}
