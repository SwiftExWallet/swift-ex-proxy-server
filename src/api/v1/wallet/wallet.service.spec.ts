import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { WalletRepository } from './wallet.repository';
import { HttpService } from '../common/services/httpService';
import { WalletSyncFailedService } from './wallet-sync-failed.service';

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: WalletRepository,
          useValue: {},
        },
        {
          provide: HttpService,
          useValue: {},
        },
        {
          provide: WalletSyncFailedService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
