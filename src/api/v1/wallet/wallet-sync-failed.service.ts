import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarkSyncFailedDto } from './dto/wallet-sync-faild.dto';
import { WalletSyncFailed } from './schema/wallet-sync-failed.schema';

@Injectable()
export class WalletSyncFailedService {
  private readonly logger = new Logger(WalletSyncFailedService.name);

  constructor(
    @InjectModel(WalletSyncFailed.name)
    private syncFailedWallet: Model<WalletSyncFailed>,
  ) {}

  async markWalletAsSyncFailed(
    markSyncFailedDto: MarkSyncFailedDto,
  ): Promise<WalletSyncFailed> {
    const failedWallet = await this.syncFailedWallet.create({
      userId: markSyncFailedDto.userId,
      deviceId: markSyncFailedDto.deviceId,
      addresses: markSyncFailedDto.addresses,
      syncError: markSyncFailedDto.syncError,
    });
    this.logger.warn('Wallets sync failed (created)');
    return failedWallet;
  }
}
