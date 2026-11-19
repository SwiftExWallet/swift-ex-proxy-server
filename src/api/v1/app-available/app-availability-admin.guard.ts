import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class AppAvailabilityAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configured = process.env.APP_AVAILABILITY_ADMIN_KEY;
    const supplied = context.switchToHttp().getRequest<Request>().headers[
      'x-app-availability-admin-key'
    ];
    if (!configured?.trim() || typeof supplied !== 'string' || !supplied) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
    const digest = (value: string) =>
      createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(configured), digest(supplied))) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
    return true;
  }
}
