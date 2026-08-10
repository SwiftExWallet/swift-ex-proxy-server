import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { HttpRequestMethod } from '../enums/httpRequest.enum';

export class HttpRequestDto {
  @IsNotEmpty()
  body: any;

  @IsNotEmpty()
  @IsEnum(() => HttpRequestMethod)
  method: HttpRequestMethod;

  @IsString()
  url: string;

  @IsNotEmpty()
  headers: Record<string, string>;
}
