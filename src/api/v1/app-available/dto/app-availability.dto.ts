import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export const SERVICE_STATUSES = [
  'operational',
  'degraded',
  'down',
  'maintenance',
  'unknown',
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
export const APP_PLATFORMS = ['android', 'ios'] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];
export const RELEASE_VERSION =
  /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;

export class ServiceIdParams {
  @Matches(/^[a-z][a-z0-9_-]{0,63}$/)
  id: string;
}

export class PlatformParams {
  @IsIn(APP_PLATFORMS)
  platform: AppPlatform;
}

export class UpdateServiceStatusDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  name: string;

  @IsIn(SERVICE_STATUSES)
  status: ServiceStatus;

  @IsString()
  @MaxLength(500)
  message: string;
}

export class UpdateAppVersionDto {
  @Matches(RELEASE_VERSION)
  latestVersion: string;

  @Matches(RELEASE_VERSION)
  minimumSupportedVersion: string;
}
