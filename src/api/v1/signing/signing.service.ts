import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verifyMessage } from 'ethers';
import { randomBytes } from 'crypto';
import { DeviceService } from '../device/device.service';
import { VerifySigningDto } from './dto/verify-signing.dto';

const EXPIRY_MS = 2 * 60 * 1000; // 2 minutes
const EXPIRES_AT_REGEX = /Expires At: (.+)$/m;

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly deviceService: DeviceService,
  ) {}

  createRequest(): { payload: string } {
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString();
    const payload = `Sign:\nNonce: ${nonce}\nExpires At: ${expiresAt}`;
    return { payload };
  }

  async verify(
    verifySigningDto: VerifySigningDto,
  ): Promise<{ valid: true; jwt: string }> {
    const { payload, signature } = verifySigningDto;

    const match = payload.match(EXPIRES_AT_REGEX);
    const expiresAtRaw = match ? match[1].trim() : null;
    this.logger.log(`Expires At: ${expiresAtRaw}`);

    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (
      !expiresAt ||
      isNaN(expiresAt.getTime()) ||
      Date.now() > expiresAt.getTime()
    ) {
      throw new BadRequestException('Signing request expired');
    }

    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(payload, signature);
      this.logger.log(`Recovered address: ${recoveredAddress}`);
    } catch (error) {
      this.logger.log(`Could not recover address: ${(error as Error).message}`);
      throw new BadRequestException('Invalid signature');
    }

    const signingDeviceUniqueId = process.env.SIGNING_DEVICE_UNIQUE_ID;
    if (!signingDeviceUniqueId) {
      throw new BadRequestException('web user is not configured');
    }

    const device = await this.deviceService.findOneByUniqueId(
      signingDeviceUniqueId,
    );
    if (!device) {
      throw new NotFoundException(`Device web user not found`);
    }

    const jwt = this.jwtService.sign({
      _id: device._id,
      walletAddress: recoveredAddress?.toLowerCase(),
    });

    return { valid: true, jwt };
  }
}
