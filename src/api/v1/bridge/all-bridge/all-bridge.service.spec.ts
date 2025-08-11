import { Test, TestingModule } from '@nestjs/testing';
import { AllBridgeService } from './all-bridge.service';

describe('AllBridgeService', () => {
  let service: AllBridgeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AllBridgeService],
    }).compile();

    service = module.get<AllBridgeService>(AllBridgeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
