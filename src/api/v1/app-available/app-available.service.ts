import { Injectable } from '@nestjs/common';
import { GeoLiteIpService, IPResult } from './geo-lite-Ip.service';

@Injectable()
export class AppAvailableService {
  constructor(private readonly geoLiteIpService: GeoLiteIpService) {}

  checkAppAvailability(ip: string): IPResult {
    return this.geoLiteIpService.checkIp(ip);
  }
}
