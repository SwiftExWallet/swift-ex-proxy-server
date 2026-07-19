import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeviceService } from '../../device/device.service';

interface DeviceTokenPayload {
  _id?: string;
  exp?: number;
}

@Injectable()
export class DeviceAuthTokenMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private readonly deviceService: DeviceService,
  ) {}

  async use(req: any, _res: Response, next: () => void): Promise<any> {
    const token = this.getDeviceToken(req);
    if (!token) {
      throw new UnauthorizedException('Device token not found');
    }

    let payload: DeviceTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<DeviceTokenPayload>(
        token,
        this.getVerifyOptions(),
      );
    } catch {
      throw new UnauthorizedException('Invalid device token');
    }

    if (!payload?._id || typeof payload.exp !== 'number') {
      throw new HttpException('Invalid Device', HttpStatus.FORBIDDEN);
    }

    const device = await this.deviceService.findOne(payload._id as any);

    if (!device) {
      throw new HttpException('Invalid Device', HttpStatus.FORBIDDEN);
    }
    req.device = device;

    next();
  }

  private getDeviceToken(req: any): string | null {
    const headerValue = req.headers['x-auth-device-token'];
    const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (typeof token !== 'string' || !token.trim()) {
      return null;
    }

    return token;
  }

  private getVerifyOptions(): Record<string, string> {
    const options: Record<string, string> = {};

    if (process.env.JWT_ISSUER) {
      options.issuer = process.env.JWT_ISSUER;
    }

    if (process.env.JWT_AUDIENCE) {
      options.audience = process.env.JWT_AUDIENCE;
    }

    return options;
  }
}
