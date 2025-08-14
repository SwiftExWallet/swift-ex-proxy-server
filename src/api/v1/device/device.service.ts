import { Injectable } from '@nestjs/common';
import { DeviceRepository } from './device.repository';
import mongoose from 'mongoose';
import { Device } from './schema/device.schema';

@Injectable()
export class DeviceService {
  constructor(private readonly deviceRepo: DeviceRepository) {}

  async findOne(_id: mongoose.Schema.Types.ObjectId): Promise<Device | null> {
    return this.deviceRepo.findOne({ _id });
  }
}
