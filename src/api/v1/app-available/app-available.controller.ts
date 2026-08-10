import { Controller, Get, Logger } from '@nestjs/common';
import { AppAvailableService } from './app-available.service';
import { ClientIp } from './ip.decorator';

@Controller('api/v1/app-available')
export class AppAvailable {
  private readonly logger = new Logger(AppAvailable.name);
  constructor(private readonly appAvailableService: AppAvailableService) {}

  @Get('/')
  checkAppAvailability(@ClientIp() ip: string) {
    this.logger.log('===== user Ip address =====', ip);
    const result = this.appAvailableService.checkAppAvailability(ip);
    return {
      ...result,
      maintenance: process.env.MAINTENANCE,
    };
  }
}
