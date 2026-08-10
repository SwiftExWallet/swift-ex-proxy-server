import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WalletRepository } from './wallet.repository';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { Wallet } from './schema/wallet.schema';
import mongoose from 'mongoose';
import { StellarAddressDto } from './dto/stellar-address.dto';
import { WalletAddressDto } from './dto/wallet-address.dto';
import { Device } from '../device/schema/device.schema';
import { WalletSyncFailedService } from './wallet-sync-failed.service';
import { SupportedWalletChain } from '../common/enums/chain.enum';
import { HttpService } from '../common/services/httpService';
import { getAddress } from 'ethers';
import {
  EVM_ADDRESS_PATTERN,
  STELLAR_ADDRESS_PATTERN,
} from '../common/constants/walletAddress.constants';

const SUPPORTED_WALLET_ADDRESS_FIELDS = Object.values(SupportedWalletChain);

export interface VerifiedDeviceWallet extends Wallet {
  walletId: string;
  address: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly walletRepo: WalletRepository,
    private readonly httpService: HttpService,
    private readonly walletSyncFailedService: WalletSyncFailedService,
  ) {}

  async create(
    createWalletDto: CreateWalletDto,
    device: Device,
  ): Promise<Wallet | null> {
    const wallet: Wallet = await this.walletRepo.create(
      Object.assign(createWalletDto, {
        deviceId: device._id,
      }),
    );
    if (process.env.ENVIRONMENT == 'prod') this.addWalletToListener(wallet);

    return this.walletRepo.findOne({ _id: wallet._id });
  }

  async addWalletToListener(wallet: Wallet) {
    try {
      const headers = {
        Authorization: `Bearer ${process.env.AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      };
      await this.httpService.put(
        process.env.LISTENER_API_URL as string,
        wallet,
        headers,
      );
    } catch (error) {
      await this.walletSyncFailedService.markWalletAsSyncFailed({
        deviceId: wallet.deviceId,
        addresses: {
          xlm: wallet.addresses.get(SupportedWalletChain.xlm) || '',
          multi: wallet.addresses.get(SupportedWalletChain.multi) || '',
        },
        syncError: error,
      });
      console.error('addWalletToListener faild', error);
    }
  }

  async findWalletByUserId(
    userId: mongoose.Schema.Types.ObjectId,
    deviceId: mongoose.Schema.Types.ObjectId,
  ): Promise<Wallet[] | null> {
    return this.walletRepo.find({ userId, deviceId });
  }

  async findByStellarAddress(
    stellarAddressDto: StellarAddressDto,
    deviceId: mongoose.Schema.Types.ObjectId,
  ): Promise<Wallet[] | null> {
    const { stellarAddress } = stellarAddressDto;

    return this.walletRepo.find({ stellarAddress, deviceId });
  }

  async findByWalletAddress(
    walletAddressDto: WalletAddressDto,
    deviceId: mongoose.Schema.Types.ObjectId,
  ): Promise<Wallet[] | null> {
    const { walletAddress, chain } = walletAddressDto;
    const key = `addresses.${SupportedWalletChain[chain]}`;
    console.log(key);
    return this.walletRepo.find({ [key]: walletAddress, deviceId });
  }

  async findByMultiChainAddressWithoutDevice(
    walletAddressDto: WalletAddressDto,
  ): Promise<Wallet | null> {
    const { walletAddress } = walletAddressDto;
    return this.walletRepo.findOne({ multiChainAddress: walletAddress });
  }

  private normalizeWalletAddress(walletAddress: string): string {
    const trimmed = walletAddress?.trim();

    if (!trimmed) {
      throw new BadRequestException('Wallet address is required.');
    }

    if (EVM_ADDRESS_PATTERN.test(trimmed)) {
      return getAddress(trimmed);
    }

    if (STELLAR_ADDRESS_PATTERN.test(trimmed.toUpperCase())) {
      return trimmed.toUpperCase();
    }

    throw new BadRequestException('Invalid wallet address format.');
  }

  private buildExactAddressPattern(walletAddress: string): RegExp {
    return new RegExp(`^${this.escapeRegExp(walletAddress)}$`, 'i');
  }

  private buildAddressLookup(walletAddress: string): Record<string, RegExp>[] {
    const addressPattern = this.buildExactAddressPattern(walletAddress);

    return SUPPORTED_WALLET_ADDRESS_FIELDS.map((chain) => ({
      [`addresses.${chain}`]: addressPattern,
    }));
  }

  private toPlainWallet(wallet: Wallet): Wallet {
    const walletWithToObject = wallet as Wallet & {
      toObject?: () => Wallet;
    };

    if (typeof walletWithToObject.toObject === 'function') {
      return walletWithToObject.toObject();
    }

    return wallet;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async verifyWalletForDevice(
    deviceId: mongoose.Schema.Types.ObjectId | string,
    walletAddress: string,
  ): Promise<VerifiedDeviceWallet | null> {
    const normalizedAddress = this.normalizeWalletAddress(walletAddress);
    const wallet = await this.walletRepo.findOne({
      deviceId,
      $or: this.buildAddressLookup(normalizedAddress),
    });

    if (!wallet) {
      return null;
    }

    const rawWalletId = wallet._id as unknown;
    const walletId =
      rawWalletId instanceof mongoose.Types.ObjectId
        ? rawWalletId.toHexString()
        : (rawWalletId as string);
    const walletObject = this.toPlainWallet(wallet);

    return {
      ...walletObject,
      walletId,
      address: normalizedAddress,
    };
  }
}
