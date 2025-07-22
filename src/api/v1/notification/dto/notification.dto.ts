import { IsNotEmpty, IsOptional } from 'class-validator';

export class NotificationDto {
  @IsNotEmpty()
  title: string;

  @IsNotEmpty()
  body: string;

  @IsOptional()
  data?: Record<string, string>;
}
