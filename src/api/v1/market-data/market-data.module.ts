import { Module } from '@nestjs/common';
import { MarketDataService } from './market-data.service';
import { MarketDataController } from './market-data.controller';
import { MarketDataRepository } from './market-data.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketData, MarketDataSchema } from './schema/market-data.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MarketData.name, schema: MarketDataSchema },
    ]),
  ],
  providers: [MarketDataService, MarketDataRepository],
  controllers: [MarketDataController],
})
export class MarketDataModule {}
