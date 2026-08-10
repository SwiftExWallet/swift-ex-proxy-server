import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { HttpRequestMethod } from '../../../common/enums/httpRequest.enum';

export class AlchemyRequestDto {
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
