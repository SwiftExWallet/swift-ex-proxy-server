import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
}
