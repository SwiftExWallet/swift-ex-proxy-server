import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { getAddress } from 'ethers';
import mongoose, { Model } from 'mongoose';
import { SupportedWalletChain } from '../common/enums/chain.enum';
import { Wallet } from './schema/wallet.schema';

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const STELLAR_ADDRESS_PATTERN =
  /^G[A-Z0-9]{55}$|^[A-Z0-9]{1,12}-G[A-Z0-9]{55}$/;
const SUPPORTED_WALLET_CHAINS = Object.values(SupportedWalletChain);

export interface VerifiedDeviceWallet {
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
        $or: this.buildAddressConditions(normalizedAddress),
      })
      .exec();

    if (!wallet) {
      return null;
    }

    return {
      walletId: String(wallet._id),
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

  private buildAddressConditions(walletAddress: string): Record<string, any>[] {
    const exactAddressPattern = new RegExp(
      `^${this.escapeRegExp(walletAddress)}$`,
      'i',
    );

    return SUPPORTED_WALLET_CHAINS.map((chain) => ({
      [`addresses.${chain}`]: exactAddressPattern,
    }));
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
