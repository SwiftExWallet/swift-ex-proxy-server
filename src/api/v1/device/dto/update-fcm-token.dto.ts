import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { DeviceAttestationDto } from './device-attestation.dto';

export class UpdateFcmTokenDto {
  @IsNotEmpty()
  fcmToken: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceAttestationDto)
  attestation?: DeviceAttestationDto;
}
