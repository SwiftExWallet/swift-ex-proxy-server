import { Controller, Get, Res } from '@nestjs/common';
import { MarketDataService } from './market-data.service';

@Controller('/api/v1/market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}
  @Get('')
  async getMarketData(@Res() response) {
    const marketData = await this.marketDataService.getMarketData();
    response.status(201).json({ marketData });
  }
}
