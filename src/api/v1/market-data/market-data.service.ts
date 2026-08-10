import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketDataDto } from './dto/market-data.dto';
import { MarketDataRepository } from './market-data.repository';
import { MarketData } from './schema/market-data.schema';

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);
  constructor(private readonly marketDataRepository: MarketDataRepository) {}

  async getMarketData(): Promise<MarketData[]> {
    return this.marketDataRepository.getMarketData();
  }

  async getCryptoData() {
    try {
      const response = await fetch(process.env.COIN_GECKO_API_URL as string, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const responseData = await response.json();
        const operations = this.transformMarketInfo(responseData);
        await this.marketDataRepository.updateBulk(operations);
      } else {
        this.logger.error('Failed to fetch crypto data:', response.statusText);
      }
    } catch (error) {
      this.logger.error('Error fetching crypto data:', error);
    }
  }

  private transformMarketInfo(marketDataDto: MarketDataDto[]): any[] {
    return marketDataDto.map((coin) => ({
      updateOne: {
        filter: { id: coin.id }, // find by coin ID
        update: {
          $set: {
            symbol: coin.symbol,
            name: coin.name,
            image: coin.image,
            currentPrice: coin.current_price,
            marketCap: coin.market_cap,
            marketCapRank: coin.market_cap_rank,
            fullyDilutedValuation: coin.fully_diluted_valuation,
            totalVolume: coin.total_volume,
            high24h: coin.high_24h,
            low24h: coin.low_24h,
            priceChange24h: coin.price_change_24h,
            priceChangePercentage24h: coin.price_change_percentage_24h,
            marketCapChange24h: coin.market_cap_change_24h,
            marketCapChangePercentage_24h:
              coin.market_cap_change_percentage_24h,
            circulatingSupply: coin.circulating_supply,
            totalSupply: coin.total_supply,
            maxSupply: coin.max_supply,
            ath: coin.ath,
            athChangePercentage: coin.ath_change_percentage,
            athDate: coin.ath_date,
            atl: coin.atl,
            atlChangePercentage: coin.atl_change_percentage,
            atlDate: coin.atl_date,
            roi: coin.roi,
            lastUpdated: coin.last_updated,
            savedAt: new Date(), // update save timestamp
          },
        },
        upsert: true, // insert if not exists
      },
    }));
  }

  @Cron('* * * * *')
  async handleCron(): Promise<void> {
    this.logger.log('Cron job running...');
    await this.getCryptoData();
  }
}
