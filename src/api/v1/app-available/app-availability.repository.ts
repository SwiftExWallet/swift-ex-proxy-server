import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AppPlatform,
  UpdateAppVersionDto,
  UpdateServiceStatusDto,
} from './dto/app-availability.dto';
import {
  AppPlatformVersion,
  AppServiceStatus,
} from './schema/app-availability.schema';

@Injectable()
export class AppAvailabilityRepository {
  constructor(
    @InjectModel(AppServiceStatus.name)
    private readonly services: Model<AppServiceStatus>,
    @InjectModel(AppPlatformVersion.name)
    private readonly versions: Model<AppPlatformVersion>,
  ) {}

  getServices() {
    return this.services.find().lean().exec();
  }

  getVersions() {
    return this.versions.find().lean().exec();
  }

  updateService(id: string, dto: UpdateServiceStatusDto) {
    return this.services
      .findOneAndUpdate(
        { _id: id },
        {
          $set: {
            name: dto.name.trim(),
            status: dto.status,
            message: dto.message,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec();
  }

  updateVersion(platform: AppPlatform, dto: UpdateAppVersionDto) {
    return this.versions
      .findOneAndUpdate(
        { _id: platform },
        {
          $set: {
            latestVersion: dto.latestVersion,
            minimumSupportedVersion: dto.minimumSupportedVersion,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean()
      .exec();
  }
}
