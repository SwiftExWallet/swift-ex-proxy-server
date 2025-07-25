import { Test, TestingModule } from '@nestjs/testing';
import { BscService } from './bsc.service';

describe('BscService', () => {
  let service: BscService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BscService],
    }).compile();

    service = module.get<BscService>(BscService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
