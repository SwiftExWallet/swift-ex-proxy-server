import { Test, TestingModule } from '@nestjs/testing';
import { AlchemyService } from './alchemy.service';
import { HttpService } from './http.service';
import { UrlSigner } from './util/urlSigner';

describe('AlchemyService', () => {
  let service: AlchemyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlchemyService,
        {
          provide: UrlSigner,
          useValue: {},
        },
        {
          provide: HttpService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AlchemyService>(AlchemyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
