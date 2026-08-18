import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum DeviceAttestationProvider {
  PLAY_INTEGRITY = 'play_integrity',
  APPLE_DEVICE_CHECK = 'apple_device_check',
}

export class DeviceAttestationDto {
  @IsEnum(DeviceAttestationProvider)
  provider: DeviceAttestationProvider;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsOptional()
  @IsString()
  nonce?: string;

  @IsOptional()
  @IsString()
  requestHash?: string;
}

export class DeviceAttestationBodyDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceAttestationDto)
  attestation?: DeviceAttestationDto;
}
