import { Test, TestingModule } from '@nestjs/testing';
import { InchService } from './1inch.service';

describe('InchService', () => {
  let service: InchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InchService],
    }).compile();

    service = module.get<InchService>(InchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
