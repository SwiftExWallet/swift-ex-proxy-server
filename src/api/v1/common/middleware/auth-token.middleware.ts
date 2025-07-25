import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/users.service';

@Injectable()
export class AuthTokenMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private readonly userService: UsersService,
  ) {}

  async use(req: any, res: Response, next: () => void): Promise<any> {
    Logger.log('==== middleware called ===');
    if (!req.headers['authorization']) {
      throw new NotFoundException('Token  not found');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const decodedToken: any = this.jwtService.decode(
      req.headers['authorization'].replace('Bearer ', ''),
    );

    if (!decodedToken) {
      throw new HttpException('Invalid token', HttpStatus.FORBIDDEN);
    }
    const user = await this.userService.findOne(decodedToken.id);
    if (!user) {
      throw new HttpException('Invalid token', HttpStatus.FORBIDDEN);
    }
    req.currentUser = user;

    next();
  }
}
