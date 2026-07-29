import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Portfolio, PortfolioToken } from './schema/portfolio.schema';

@Injectable()
export class PortfolioRepository {
  constructor(
    @InjectModel(Portfolio.name)
    private readonly model: Model<Portfolio>,
  ) {}

  async findByDeviceAndAddress(deviceId: string, address: string): Promise<Portfolio | null> {
    return this.model.findOne({ deviceId, address }).exec();
  }

  async upsert(
    deviceId: string,
    address: string,
    tokens: PortfolioToken[],
    totalValueUsd: string,
  ): Promise<Portfolio | null> {
    return this.model
      .findOneAndUpdate(
        { deviceId, address },
        {
          $set: {
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
  }

  async markSyncing(deviceId: string, address: string): Promise<void> {
    await this.model
      .updateOne({ deviceId, address }, { $set: { syncStatus: 'syncing' } })
      .exec();
  }

  async markFailed(deviceId: string, address: string, error: string): Promise<void> {
    await this.model
      .updateOne(
        { deviceId, address },
        { $set: { syncStatus: 'failed', lastSyncError: error } },
      )
      .exec();
  }

  async markStaleByAddress(address: string): Promise<void> {
    await this.model.updateMany({ address }, { $set: { stale: true } }).exec();
  }
}
