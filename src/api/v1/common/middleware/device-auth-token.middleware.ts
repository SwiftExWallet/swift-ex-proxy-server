import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeviceService } from '../../device/device.service';

@Injectable()
export class DeviceAuthTokenMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private readonly deviceService: DeviceService,
  ) {}

  async use(req: any, res: Response, next: () => void): Promise<any> {
    Logger.log('==== device auth middleware called ===');
    const route = req.originalUrl;
    console.log('route =====', route);
    if (!req.headers['x-auth-device-token']) {
      throw new NotFoundException('Device token  not found');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const decodedToken: any = this.jwtService.decode(
      req.headers['x-auth-device-token'],
    );

    console.log('===decoded token ===', decodedToken);

    if (!decodedToken?._id) {
      console.log('==== no id ===');
      throw new HttpException('Invalid Device', HttpStatus.FORBIDDEN);
    }
    const device = await this.deviceService.findOne(decodedToken._id);
    console.log('==== device===', { device });

    if (!device) {
      throw new HttpException('Invalid Device', HttpStatus.FORBIDDEN);
    }
    req.device = device;

    next();
  }
}
