import { Test, TestingModule } from '@nestjs/testing';
import { EthService } from './eth.service';

describe('EthService', () => {
  let service: EthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EthService],
    }).compile();

    service = module.get<EthService>(EthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
