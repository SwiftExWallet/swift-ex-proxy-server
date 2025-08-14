import { Injectable } from '@nestjs/common';
import { Device } from './schema/device.schema';
import { DeviceRepository } from './device.repository';
import mongoose from 'mongoose';

@Injectable()
export class DeviceService {
  constructor(private readonly deviceRepo: DeviceRepository) {}

  findOne(_id: mongoose.Schema.Types.ObjectId): Promise<Device | null> {
    return this.deviceRepo.findOne({ _id });
  }
}
