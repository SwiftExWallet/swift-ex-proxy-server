import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Device } from '../device/schema/device.schema';
import { RecoveryRegistration } from './schema/recovery-registration.schema';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class RecoveryRegistrationService {
  constructor(
    @InjectModel(RecoveryRegistration.name)
    private readonly registrationModel: Model<RecoveryRegistration>,
  ) {}

  findByEmail(email: string) {
    return this.registrationModel
      .findOne({ email: normalizeEmail(email) })
      .exec();
  }

  register(email: string, walletAddress: string, device: Device) {
    return this.registrationModel
      .findOneAndUpdate(
        { walletAddress },
        {
          $set: {
            email: normalizeEmail(email),
            walletAddress,
            deviceUniqueId: device.uniqueId,
            fcmToken: device.fcmToken,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
  }
}
