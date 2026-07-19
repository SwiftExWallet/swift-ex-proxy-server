import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BODY_SIZE_LIMIT_KEY,
  BodySizeLimitConfig,
} from '../decorators/body-size-limit.decorator';

@Injectable()
export class BodySizeLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.reflector.getAllAndOverride<BodySizeLimitConfig>(
      BODY_SIZE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const contentLength = this.getContentLength(request);

    if (contentLength == null || contentLength > config.maxBytes) {
      throw new HttpException(
        {
          code: 'REQUEST_BODY_TOO_LARGE',
          message: 'Request body too large.',
          limit: config.key ?? 'route-body',
          maxBytes: config.maxBytes,
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    return true;
  }

  private getContentLength(request: any): number | null {
    const rawHeader = request.headers?.['content-length'];
    const rawValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (typeof rawValue !== 'string' || rawValue.trim() === '') {
      return null;
    }

    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }
}
