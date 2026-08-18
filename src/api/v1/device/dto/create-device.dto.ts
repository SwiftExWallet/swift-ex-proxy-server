import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { DeviceAttestationDto } from './device-attestation.dto';

export class CreateDeviceDto {
  @IsOptional()
  brand: string;

  @IsOptional()
  model: string;

  @IsNotEmpty()
  uniqueId: string;

  @IsOptional()
  type: string;

  @IsNotEmpty()
  macAddress: string;

  @IsNotEmpty()
  fcmToken: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceAttestationDto)
  attestation?: DeviceAttestationDto;
}
