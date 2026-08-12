import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Portfolio, PortfolioToken } from './schema/portfolio.schema';

@Injectable()
export class PortfolioRepository {
  private readonly logger = new Logger(PortfolioRepository.name);

  constructor(
    @InjectModel(Portfolio.name)
    private readonly model: Model<Portfolio>,
  ) {}

  async findByAddress(address: string): Promise<Portfolio | null> {
    return this.model.findOne({ address }).exec();
  }

  async upsert(
    deviceId: string,
    address: string,
    tokens: PortfolioToken[],
    totalValueUsd: string,
  ): Promise<Portfolio | null> {
    const result = await this.model
      .findOneAndUpdate(
        { address },
        {
          $set: {
            deviceId,
            tokens,
            totalValueUsd,
            stale: false,
            syncStatus: 'idle',
            lastSyncedAt: new Date(),
            lastSyncError: null,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    this.logger.log(
      `portfolio upserted for address=${address} tokens=${tokens.length} totalValueUsd=${totalValueUsd}`,
    );

    return result;
  }

  async markSyncing(deviceId: string, address: string): Promise<void> {
    await this.model
      .updateOne({ address }, { $set: { deviceId, syncStatus: 'syncing' } })
      .exec();
  }

  async markFailed(
    deviceId: string,
    address: string,
    error: string,
  ): Promise<void> {
    await this.model
      .updateOne(
        { address },
        { $set: { deviceId, syncStatus: 'failed', lastSyncError: error } },
      )
      .exec();
  }

  async markStaleByAddress(address: string): Promise<void> {
    await this.model.updateMany({ address }, { $set: { stale: true } }).exec();
  }
}
