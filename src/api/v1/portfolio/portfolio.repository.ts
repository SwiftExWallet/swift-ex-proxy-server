import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { Portfolio, PortfolioToken } from './schema/portfolio.schema';

export interface PortfolioTokenTotalsResponse {
  network: string;
  tokenAddress: string | null;
  symbol: string;
  name: string | null;
  decimals: number | null;
  logo: string | null;
  balanceHex: string;
  balance: string;
  priceUsd: string | null;
  valueUsd: string;
}

export interface DevicePortfolioResponse {
  address: string;
  totalValueUsd: string;
  syncStatus: string;
  lastSyncedAt: Date | null;
  updatedAt: Date;
  tokens: PortfolioToken[];
}

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

  async findByDevice(deviceId: string): Promise<DevicePortfolioResponse[]> {
    const matchDeviceId = this.toDeviceMatchId(deviceId);

    return this.model
      .find({ deviceId: matchDeviceId })
      .select({
        _id: 0,
        address: 1,
        totalValueUsd: 1,
        syncStatus: 1,
        lastSyncedAt: 1,
        updatedAt: 1,
        tokens: 1,
      })
      .lean<DevicePortfolioResponse[]>()
      .exec();
  }

  async aggregateTotalsByDevice(
    deviceId: string,
  ): Promise<PortfolioTokenTotalsResponse[]> {
    const matchDeviceId = this.toDeviceMatchId(deviceId);

    const rows = await this.model
      .aggregate<{
        network: string;
        tokenAddress: string | null;
        symbol: string;
        name: string | null;
        decimals: number | null;
        logo: string | null;
        balanceHex: string;
        balance: number;
        priceUsd: string | null;
        valueUsd: number;
      }>([
        { $match: { deviceId: matchDeviceId } },
        { $unwind: '$tokens' },
        {
          $match: {
            'tokens.symbol': { $nin: [null, ''] },
          },
        },
        {
          $group: {
            _id: { $toUpper: '$tokens.symbol' },
            network: { $first: '$tokens.network' },
            tokenAddress: { $first: '$tokens.tokenAddress' },
            name: { $first: '$tokens.name' },
            decimals: { $first: '$tokens.decimals' },
            logo: { $first: '$tokens.logo' },
            balance: {
              $sum: {
                $convert: {
                  input: '$tokens.balance',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
            },
            valueUsd: {
              $sum: {
                $convert: {
                  input: '$tokens.valueUsd',
                  to: 'double',
                  onError: 0,
                  onNull: 0,
                },
              },
            },
            priceUsd: { $first: '$tokens.priceUsd' },
          },
        },
        {
          $project: {
            _id: 0,
            network: 1,
            tokenAddress: 1,
            symbol: '$_id',
            name: 1,
            decimals: 1,
            logo: 1,
            balanceHex: '0x0',
            balance: 1,
            priceUsd: 1,
            valueUsd: 1,
          },
        },
        { $sort: { symbol: 1 } },
      ])
      .exec();

    return rows.map((row) => ({
      ...row,
      balance: row.balance.toString(),
      valueUsd: row.valueUsd.toString(),
    }));
  }

  private toDeviceMatchId(deviceId: string): mongoose.Types.ObjectId | string {
    return mongoose.Types.ObjectId.isValid(deviceId)
      ? new mongoose.Types.ObjectId(deviceId)
      : deviceId;
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

  async updateDevice(address: string, deviceId: string): Promise<void> {
    await this.model.updateOne({ address }, { $set: { deviceId } }).exec();
  }
}
