import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as maxmind from 'maxmind';
import restrictedCountries from './util/restrictedCountries.json';

export interface IPResult {
  countryCode: string | null;
  countryName: string | null;
  isRestricted: boolean;
}

type GeoIpResult = {
  country?: {
    iso_code?: string;
    names?: {
      en?: string;
    };
  };
};

type GeoIpLookup = {
  get(ip: string): GeoIpResult | null;
};

@Injectable()
export class GeoLiteIpService implements OnModuleInit {
  private lookup: GeoIpLookup | null = null;
  private readonly logger = new Logger(GeoLiteIpService.name);
  private readonly restrictedCountries: readonly string[] = restrictedCountries;

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  private async init(): Promise<void> {
    try {
      const countryDb = process.env.COUNTRY_DB;
      if (!countryDb) {
        this.logger.warn('COUNTRY_DB is not configured');
        return;
      }

      this.lookup = (await maxmind.open(countryDb)) as GeoIpLookup;
      this.logger.log('GeoLite Country DB loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load GeoLite DB:', error);
    }
  }

  checkIp(ip: string): IPResult {
    if (!ip) {
      return { countryCode: null, countryName: null, isRestricted: true };
    }
    if (!this.lookup) {
      return { countryCode: null, countryName: null, isRestricted: false };
    }
    try {
      const result = this.lookup.get(ip);
      const countryCode = result?.country?.iso_code;
      if (!countryCode) {
        return { countryCode: null, countryName: null, isRestricted: false };
      }

      const isRestricted = this.restrictedCountries.includes(countryCode);

      return {
        countryCode,
        countryName: result.country?.names?.en ?? null,
        isRestricted,
      };
    } catch (error) {
      this.logger.error('error in ip', error);
      this.logger.warn(`IP lookup failed for ${ip}`);
      return { countryCode: null, countryName: null, isRestricted: true };
    }
  }

  isRestricted(ip: string): boolean {
    return this.checkIp(ip).isRestricted;
  }
}
