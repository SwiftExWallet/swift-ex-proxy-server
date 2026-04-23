import { Test, TestingModule } from '@nestjs/testing';
import { RangoService } from './rango.service';

describe('RangoService', () => {
  let service: RangoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RangoService],
    }).compile();

    service = module.get<RangoService>(RangoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
