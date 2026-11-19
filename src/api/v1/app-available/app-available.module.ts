import { Module } from '@nestjs/common';
import { AppAvailableService } from './app-available.service';
import { AppAvailable } from './app-available.controller';
import { GeoLiteIpService } from './geo-lite-Ip.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AppAvailabilityRepository } from './app-availability.repository';
import { AppAvailabilityAdminGuard } from './app-availability-admin.guard';
import {
  AppPlatformVersion,
  AppPlatformVersionSchema,
  AppServiceStatus,
  AppServiceStatusSchema,
} from './schema/app-availability.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppServiceStatus.name, schema: AppServiceStatusSchema },
      { name: AppPlatformVersion.name, schema: AppPlatformVersionSchema },
    ]),
  ],
  providers: [
    GeoLiteIpService,
    AppAvailableService,
    AppAvailabilityRepository,
    AppAvailabilityAdminGuard,
  ],
  exports: [AppAvailableService],
  controllers: [AppAvailable],
})
export class AppAvailableModule {}
