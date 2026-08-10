import { IsNotEmpty, IsOptional } from 'class-validator';

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
}
