import {
  ForbiddenException,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { WalletService } from '../../wallet/wallet.service';

export const WALLET_ADDRESS_HEADER = 'x-wallet-address';

@Injectable()
export class DeviceWalletMiddleware implements NestMiddleware {
  constructor(private readonly walletService: WalletService) {}

  async use(req: any, _res: Response, next: NextFunction): Promise<void> {
    const walletAddress = this.getWalletAddress(req);

    if (!walletAddress) {
      throw new UnauthorizedException('Wallet address not found.');
    }

    if (!req.device?._id) {
      throw new UnauthorizedException('Device not found.');
    }

    const verifiedWallet = await this.walletService.verifyWalletForDevice(
      req.device._id,
      walletAddress,
    );

    if (!verifiedWallet) {
      throw new ForbiddenException(
        'Wallet address is not associated with this device.',
      );
    }

    req.wallet = verifiedWallet;
    next();
  }

  private getWalletAddress(req: any): string | null {
    const headerValue = req.headers?.[WALLET_ADDRESS_HEADER];

    if (Array.isArray(headerValue)) {
      return null;
    }

    const walletAddress = headerValue;

    if (typeof walletAddress !== 'string' || !walletAddress.trim()) {
      return null;
    }

    if (walletAddress.includes(',')) {
      return null;
    }

    return walletAddress.trim();
  }
}
