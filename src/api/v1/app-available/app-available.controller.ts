import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AppAvailableService } from './app-available.service';
import { ClientIp } from './ip.decorator';
import { AppAvailabilityAdminGuard } from './app-availability-admin.guard';
import {
  PlatformParams,
  ServiceIdParams,
  UpdateAppVersionDto,
  UpdateServiceStatusDto,
} from './dto/app-availability.dto';

@Controller('api/v1/app-available')
export class AppAvailable {
  private readonly logger = new Logger(AppAvailable.name);
  constructor(private readonly appAvailableService: AppAvailableService) {}

  @Get('/')
  @Header('Cache-Control', 'no-store')
  async checkAppAvailability(@ClientIp() ip: string) {
    this.logger.log('===== user Ip address =====', ip);
    const result = await this.appAvailableService.checkAppAvailability(ip);
    return {
      ...result,
      maintenance: process.env.MAINTENANCE,
    };
  }

  @Put('services/:id')
  @UseGuards(AppAvailabilityAdminGuard)
  updateService(
    @Param() params: ServiceIdParams,
    @Body() dto: UpdateServiceStatusDto,
  ) {
    return this.appAvailableService.updateService(params.id, dto);
  }

  @Put('versions/:platform')
  @UseGuards(AppAvailabilityAdminGuard)
  updateVersion(
    @Param() params: PlatformParams,
    @Body() dto: UpdateAppVersionDto,
  ) {
    return this.appAvailableService.updateVersion(params.platform, dto);
  }
}
