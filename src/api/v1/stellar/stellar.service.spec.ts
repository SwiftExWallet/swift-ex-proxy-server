import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';

describe('StellarService', () => {
  let service: StellarService;
  const previousRpcStellar = process.env.RPC_STELLAR;

  beforeAll(() => {
    process.env.RPC_STELLAR = 'https://horizon-testnet.stellar.org';
  });

  afterAll(() => {
    if (previousRpcStellar === undefined) delete process.env.RPC_STELLAR;
    else process.env.RPC_STELLAR = previousRpcStellar;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarService],
    }).compile();

    service = module.get<StellarService>(StellarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
