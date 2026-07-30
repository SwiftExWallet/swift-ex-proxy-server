import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { getAddress } from 'ethers';
import mongoose, { Model } from 'mongoose';
import { SupportedWalletChain } from '../common/enums/chain.enum';
import { Wallet } from './schema/wallet.schema';

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const STELLAR_ADDRESS_PATTERN =
  /^G[A-Z0-9]{55}$|^[A-Z0-9]{1,12}-G[A-Z0-9]{55}$/;
const SUPPORTED_WALLET_ADDRESS_FIELDS = Object.values(SupportedWalletChain);

export interface VerifiedDeviceWallet extends Wallet {
  walletId: string;
  address: string;
}

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name)
    private readonly walletModel: Model<Wallet>,
  ) {}

  async verifyWalletForDevice(
    deviceId: mongoose.Schema.Types.ObjectId | string,
    walletAddress: string,
  ): Promise<VerifiedDeviceWallet | null> {
    const normalizedAddress = this.normalizeWalletAddress(walletAddress);
    const wallet = await this.walletModel
      .findOne({
        deviceId,
        $or: this.buildAddressLookup(normalizedAddress),
      })
      .exec();

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
}
