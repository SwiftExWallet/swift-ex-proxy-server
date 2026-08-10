import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MarketData } from './schema/market-data.schema';

@Injectable()
export class MarketDataRepository {
  constructor(
    @InjectModel(MarketData.name)
    private marketDataModel: Model<MarketData>,
  ) {}

  updateBulk(operations: any[]) {
    return this.marketDataModel.bulkWrite(operations);
  }

  getMarketData(): Promise<MarketData[]> {
    return this.marketDataModel.find();
  }
}
