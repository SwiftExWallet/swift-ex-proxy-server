import { IsNotEmpty } from 'class-validator';

export class UpdateFcmTokenDto {
  @IsNotEmpty()
  fcmToken: string;
}
