import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GeoLiteIpService } from './geo-lite-Ip.service';
import { AppAvailabilityRepository } from './app-availability.repository';
import {
  AppPlatform,
  UpdateAppVersionDto,
  UpdateServiceStatusDto,
} from './dto/app-availability.dto';
import { AppServiceStatus } from './schema/app-availability.schema';

@Injectable()
export class AppAvailableService {
  constructor(
    private readonly geoLiteIpService: GeoLiteIpService,
    private readonly repository: AppAvailabilityRepository,
  ) {}

  async checkAppAvailability(ip: string) {
    const geo = this.geoLiteIpService.checkIp(ip);
    const [services, versions] = await this.databaseOperation(() =>
      Promise.all([
        this.repository.getServices(),
        this.repository.getVersions(),
      ]),
    );
    const versionFor = (platform: AppPlatform) => {
      const version = versions.find((entry) => entry._id === platform);
      return version
        ? {
            latestVersion: version.latestVersion,
            minimumSupportedVersion: version.minimumSupportedVersion,
          }
        : null;
    };
    return {
      ...geo,
      services: services
        .sort((a, b) => a._id.localeCompare(b._id))
        .map((entry) => this.publicService(entry)),
      appVersion: { android: versionFor('android'), ios: versionFor('ios') },
    };
  }

  async updateService(id: string, dto: UpdateServiceStatusDto) {
    const service = await this.databaseOperation(() =>
      this.repository.updateService(id, dto),
    );
    if (!service)
      throw new ServiceUnavailableException(
        'Availability configuration could not be saved',
      );
    return this.publicService(service);
  }

  async updateVersion(platform: AppPlatform, dto: UpdateAppVersionDto) {
    const latest = dto.latestVersion.split('.').map(Number);
    const minimum = dto.minimumSupportedVersion.split('.').map(Number);
    const difference = minimum
      .map((part, index) => part - latest[index])
      .find((part) => part !== 0);
    if (difference !== undefined && difference > 0) {
      throw new BadRequestException(
        'minimumSupportedVersion must not exceed latestVersion',
      );
    }
    const version = await this.databaseOperation(() =>
      this.repository.updateVersion(platform, dto),
    );
    if (!version)
      throw new ServiceUnavailableException(
        'Availability configuration could not be saved',
      );
    return {
      latestVersion: version.latestVersion,
      minimumSupportedVersion: version.minimumSupportedVersion,
    };
  }

  private publicService(service: AppServiceStatus) {
    return {
      id: service._id,
      name: service.name,
      status: service.status,
      message: service.message,
      updatedAt: service.updatedAt,
    };
  }

  private async databaseOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new ServiceUnavailableException(
        'Availability configuration is temporarily unavailable',
      );
    }
  }
}
