import { Test, TestingModule } from '@nestjs/testing';
import { MarketDataService } from './market-data.service';
import { MarketDataRepository } from './market-data.repository';

describe('MarketDataService', () => {
  let service: MarketDataService;
  let marketDataRepository: {
    getMarketData: jest.Mock;
    updateBulk: jest.Mock;
  };

  beforeEach(async () => {
    marketDataRepository = {
      getMarketData: jest.fn(),
      updateBulk: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataService,
        {
          provide: MarketDataRepository,
          useValue: marketDataRepository,
        },
      ],
    }).compile();

    service = module.get<MarketDataService>(MarketDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('skips crypto data fetch when CoinGecko URL is not configured', async () => {
    const originalCoinGeckoUrl = process.env.COIN_GECKO_API_URL;
    const originalFetch = global.fetch;
    const fetchMock = jest.fn();
    delete process.env.COIN_GECKO_API_URL;
    global.fetch = fetchMock;

    try {
      await service.getCryptoData();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(marketDataRepository.updateBulk).not.toHaveBeenCalled();
    } finally {
      if (originalCoinGeckoUrl === undefined) {
        delete process.env.COIN_GECKO_API_URL;
      } else {
        process.env.COIN_GECKO_API_URL = originalCoinGeckoUrl;
      }
      global.fetch = originalFetch;
    }
  });
});
