import { Test, TestingModule } from '@nestjs/testing';
import { ChainEnum } from '../common/enums/chain.enum';
import { ProviderService } from './provider.service';

describe('ProviderService', () => {
  const originalEnv = process.env;
  let service: ProviderService;

  function clearProviderEnv(): void {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('PROVIDER_RPC_')) {
        delete process.env[key];
      }
    }
  }

  beforeEach(async () => {
    process.env = { ...originalEnv };
    clearProviderEnv();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProviderService],
    }).compile();

    service = module.get<ProviderService>(ProviderService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns allowlisted RPC URLs for configured chains', () => {
    process.env = {
      ...originalEnv,
      ENVIRONMENT: 'prod',
      PROVIDER_RPC_ALLOWED_HOSTS: 'eth-rpc.example,bsc-rpc.example',
      PROVIDER_RPC_ETH_1: 'https://eth-rpc.example/key',
      PROVIDER_RPC_BSC: 'https://bsc-rpc.example/key',
    };
    const configuredService = new ProviderService();

    expect(configuredService.getRpcUrl()).toBe('https://eth-rpc.example/key');
    expect(configuredService.getChainRpcUrl(ChainEnum.BSC)).toBe(
      'https://bsc-rpc.example/key',
    );
  });

  it('rejects unallowlisted RPC URLs', () => {
    process.env = {
      ...originalEnv,
      ENVIRONMENT: 'prod',
      PROVIDER_RPC_ALLOWED_HOSTS: 'eth-rpc.example',
      PROVIDER_RPC_ETH_1: 'https://evil.example/key',
    };

    expect(() => new ProviderService()).toThrow(
      'PROVIDER_RPC_ETH_1 host is not allowlisted',
    );
  });
});
