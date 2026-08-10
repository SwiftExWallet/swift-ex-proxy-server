import { Test, TestingModule } from '@nestjs/testing';
import { MarketDataService } from './market-data.service';
import { MarketDataRepository } from './market-data.repository';

describe('MarketDataService', () => {
  let service: MarketDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketDataService,
        {
          provide: MarketDataRepository,
          useValue: {
            getMarketData: jest.fn(),
            updateBulk: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MarketDataService>(MarketDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
