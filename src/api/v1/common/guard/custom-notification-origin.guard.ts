import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function parseCsv(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOriginFormat(origin: string): boolean {
  try {
    const parsed = new URL(origin);

    if (parsed.protocol === 'https:') {
      return true;
    }

    return (
      process.env.NODE_ENV !== 'production' &&
      parsed.protocol === 'http:' &&
      LOCAL_DEVELOPMENT_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function getAllowedOrigins(): Set<string> {
  const configuredOrigins =
    process.env.CUSTOM_NOTIFICATION_ALLOWED_ORIGINS ||
    process.env.CORS_ALLOWED_ORIGINS;

  return new Set(parseCsv(configuredOrigins).filter(isAllowedOriginFormat));
}

@Injectable()
export class CustomNotificationOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const headerValue = req.headers?.origin;
    const origin = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (typeof origin !== 'string' || !origin.trim()) {
      throw new ForbiddenException('Origin is not allowed');
    }

    if (!getAllowedOrigins().has(origin.trim())) {
      throw new ForbiddenException('Origin is not allowed');
    }

    return true;
  }
}
