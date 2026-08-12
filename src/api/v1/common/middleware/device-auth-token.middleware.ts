import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeviceService } from '../../device/device.service';
import { WalletService } from '../../wallet/wallet.service';
import type { VerifiedDeviceWallet } from '../../wallet/wallet.service';
import { SupportedWalletChain } from '../enums/chain.enum';
import {
  resolveVerifiedWalletAddress,
  type RequestWallet,
} from '../helpers/requestWallet';

interface DeviceTokenPayload {
  _id?: string;
  exp?: number;
}

export const DEVICE_AUTH_TOKEN_HEADER = 'x-auth-device-token';
export const WALLET_AUTH_TOKEN_HEADER = 'x-auth-wallet-token';
export const WALLET_ADDRESS_HEADER = 'x-wallet-address';
const WALLET_TOKEN_ROUTE_PREFIXES = [
  'api/v1/quoter',
  'api/v1/swap/1inch',
  'api/v1/swap/uniswap',
  'api/v1/swapOrders',
  'api/v1/eth',
  'api/v1/usdt',
  'api/v1/bsc',
];
const WALLET_TOKEN_ROUTE_PATHS = ['api/v1/bridge/swap-transaction/prepare'];

@Injectable()
export class DeviceAuthTokenMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private readonly deviceService: DeviceService,
    private readonly walletService: WalletService,
  ) {}

  async use(req: any, _res: Response, next: () => void): Promise<any> {
    const deviceToken = this.getHeaderToken(req, DEVICE_AUTH_TOKEN_HEADER);
    if (deviceToken) {
      await this.attachDevice(req, deviceToken);
      await this.attachDeviceWalletIfNeeded(req);
      next();
      return;
    }

    const walletToken = this.getHeaderToken(req, WALLET_AUTH_TOKEN_HEADER);
    if (walletToken && this.isWalletTokenRoute(req)) {
      await this.attachWallet(req, walletToken);
      next();
      return;
    }

    throw new UnauthorizedException('Device token not found');
  }

  private async attachDevice(req: any, token: string): Promise<void> {
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
  }

  private async attachDeviceWalletIfNeeded(req: any): Promise<void> {
    if (!this.isWalletTokenRoute(req)) {
      return;
    }

    const walletAddress = this.getWalletAddress(req);

    if (!walletAddress) {
      throw new UnauthorizedException('Wallet address not found.');
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

    req.wallet = this.toRequestWalletFromVerifiedWallet(verifiedWallet);
  }

  private async attachWallet(req: any, token: string): Promise<void> {
    let payload: RequestWallet;
    try {
      payload = await this.jwtService.verifyAsync<RequestWallet>(
        token,
        this.getVerifyOptions(),
      );
    } catch {
      throw new UnauthorizedException('Invalid wallet token');
    }

    req.wallet = this.toRequestWallet(payload);
  }

  private getHeaderToken(req: any, headerName: string): string | null {
    const headerValue = req.headers?.[headerName];
    const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (typeof token !== 'string' || !token.trim()) {
      return null;
    }

    return token;
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

  private toRequestWallet(payload: RequestWallet): RequestWallet {
    const wallet = {
      multi: this.getWalletPayloadAddress(payload?.multi),
      xlm: this.getWalletPayloadAddress(payload?.xlm),
    };

    if (!wallet.multi && !wallet.xlm) {
      throw new UnauthorizedException('Invalid wallet token');
    }

    return wallet;
  }

  private getWalletPayloadAddress(address: unknown): string | undefined {
    return typeof address === 'string' && address.trim()
      ? address.trim()
      : undefined;
  }

  private toRequestWalletFromVerifiedWallet(
    verifiedWallet: VerifiedDeviceWallet,
  ): RequestWallet {
    return {
      [SupportedWalletChain.multi]: resolveVerifiedWalletAddress(
        verifiedWallet,
        SupportedWalletChain.multi,
      ),
      [SupportedWalletChain.xlm]: resolveVerifiedWalletAddress(
        verifiedWallet,
        SupportedWalletChain.xlm,
      ),
    };
  }

  private isWalletTokenRoute(req: any): boolean {
    const method = String(req.method ?? '').toUpperCase();
    const path = String(req.originalUrl ?? req.url ?? '')
      .split('?')[0]
      .replace(/^\/+/, '');

    if (
      method === 'POST' &&
      (path === 'api/v1/swap/1inch/customNotification' ||
        path === 'api/v1/swapOrders/bridgeOrderStatus')
    ) {
      return false;
    }

    return (
      WALLET_TOKEN_ROUTE_PATHS.includes(path) ||
      WALLET_TOKEN_ROUTE_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      )
    );
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
