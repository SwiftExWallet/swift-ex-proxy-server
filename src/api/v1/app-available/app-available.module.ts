import { Module } from '@nestjs/common';
import { AppAvailableService } from './app-available.service';
import { AppAvailable } from './app-available.controller';
import { GeoLiteIpService } from './geo-lite-Ip.service';

@Module({
  providers: [GeoLiteIpService, AppAvailableService],
  exports: [AppAvailableService],
  controllers: [AppAvailable],
})
export class AppAvailableModule {}
