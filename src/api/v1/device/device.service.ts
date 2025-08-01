import { Injectable } from '@nestjs/common';
import { Device } from './schema/device.schema';
import { DeviceRepository } from './device.repository';

@Injectable()
export class DeviceService {
  constructor(private readonly deviceRepo: DeviceRepository) {}

  findOne(cond: any): Promise<Device | null> {
    return this.deviceRepo.findOne(cond);
  }
}
