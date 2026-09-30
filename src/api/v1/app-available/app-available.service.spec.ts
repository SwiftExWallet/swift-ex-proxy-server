import { AppAvailableService } from './app-available.service';
import { GeoLiteIpService } from './geo-lite-Ip.service';
import { AppAvailabilityRepository } from './app-availability.repository';

describe('AppAvailableService', () => {
  it('preserves geo restrictions and exposes empty configuration explicitly', async () => {
    const geo = {
      checkIp: jest.fn().mockReturnValue({
        countryCode: 'US',
        countryName: 'United States',
        isRestricted: true,
      }),
    };
    const repository = {
      getServices: jest.fn().mockResolvedValue([]),
      getVersions: jest.fn().mockResolvedValue([]),
    };
    const service = new AppAvailableService(
      geo as unknown as GeoLiteIpService,
      repository as unknown as AppAvailabilityRepository,
    );
    expect(await service.checkAppAvailability('127.0.0.1')).toEqual({
      countryCode: 'US',
      countryName: 'United States',
      isRestricted: true,
      services: [],
      appVersion: { android: null, ios: null },
    });
  });
});
