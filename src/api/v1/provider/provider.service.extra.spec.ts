import { Test, TestingModule } from '@nestjs/testing';
import { ProviderService } from './provider.service';
import { ChainEnum } from '../common/enums/chain.enum';

const mockProviderInstance = {
  getNetwork: jest.fn(),
  broadcastTransaction: jest.fn(),
};
const mockContractInstance = {};

jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => mockProviderInstance),
  Contract: jest.fn().mockImplementation(() => mockContractInstance),
  Network: {
    from: jest.fn().mockReturnValue({ chainId: 1n, name: 'mainnet' }),
  },
}));

describe('ProviderService', () => {
  let service: ProviderService;

  beforeEach(async () => {
    process.env.PROVIDER_RPC_ETH_1 = 'http://eth-1.test';
    process.env.PROVIDER_RPC_ETH_2 = 'http://eth-2.test';
    process.env.PROVIDER_RPC_ETH_3 = 'http://eth-3.test';
    process.env.PROVIDER_RPC_ETH_4 = 'http://eth-4.test';
    process.env.PROVIDER_RPC_ETH_5 = 'http://eth-5.test';
    process.env.PROVIDER_RPC_BSC = 'http://bsc.test';
    process.env.PROVIDER_RPC_POL_1 = 'http://pol-1.test';
    process.env.PROVIDER_RPC_ARB_1 = 'http://arb-1.test';
    process.env.PROVIDER_RPC_BASE_1 = 'http://base-1.test';
    process.env.PROVIDER_RPC_AVAX_1 = 'http://avax-1.test';
    process.env.PROVIDER_RPC_OPT_1 = 'http://opt-1.test';
    process.env.ENVIRONMENT = 'dev';

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProviderService],
    }).compile();

    service = module.get<ProviderService>(ProviderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    [
      'PROVIDER_RPC_ETH_1',
      'PROVIDER_RPC_ETH_2',
      'PROVIDER_RPC_ETH_3',
      'PROVIDER_RPC_ETH_4',
      'PROVIDER_RPC_ETH_5',
      'PROVIDER_RPC_BSC',
      'PROVIDER_RPC_POL_1',
      'PROVIDER_RPC_ARB_1',
      'PROVIDER_RPC_BASE_1',
      'PROVIDER_RPC_AVAX_1',
      'PROVIDER_RPC_OPT_1',
      'ENVIRONMENT',
    ].forEach((k) => delete process.env[k]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRpcUrl', () => {
    it('rotates through all 5 ETH RPC URLs', () => {
      const urls = [
        'http://eth-1.test',
        'http://eth-2.test',
        'http://eth-3.test',
        'http://eth-4.test',
        'http://eth-5.test',
      ];
      urls.forEach((url) => expect(service.getRpcUrl()).toBe(url));
    });

    it('wraps around after exhausting the list', () => {
      for (let i = 0; i < 5; i++) service.getRpcUrl();
      expect(service.getRpcUrl()).toBe('http://eth-1.test');
    });
  });

  describe('getChainRpcUrl', () => {
    it('returns BSC URL', () => {
      expect(service.getChainRpcUrl(ChainEnum.BSC)).toBe('http://bsc.test');
    });

    it('returns POL URL', () => {
      expect(service.getChainRpcUrl(ChainEnum.POL)).toBe('http://pol-1.test');
    });

    it('returns ARB URL', () => {
      expect(service.getChainRpcUrl(ChainEnum.ARB)).toBe('http://arb-1.test');
    });

    it('throws when no URLs configured for chain', () => {
      delete process.env.PROVIDER_RPC_POL_1;
      // Rebuild service with missing env var
      const svc = new ProviderService();
      expect(() => svc.getChainRpcUrl(ChainEnum.POL)).toThrow(
        'No RPC URLs configured',
      );
    });
  });

  describe('getProvider', () => {
    it('returns a JsonRpcProvider for ETH', () => {
      const { JsonRpcProvider } = jest.requireMock('ethers');
      const provider = service.getProvider(ChainEnum.ETH);
      expect(JsonRpcProvider).toHaveBeenCalled();
      expect(provider).toBe(mockProviderInstance);
    });

    it('returns the shared bscProvider for BSC', () => {
      const provider = service.getProvider(ChainEnum.BSC);
      expect(provider).toBe(service.bscProvider);
    });

    it('returns a JsonRpcProvider for ARB with chainId', () => {
      const { JsonRpcProvider } = jest.requireMock('ethers');
      service.getProvider(ChainEnum.ARB);
      expect(JsonRpcProvider).toHaveBeenCalledWith(
        'http://arb-1.test',
        expect.anything(),
        { staticNetwork: true },
      );
    });
  });

  describe('getContract', () => {
    it('creates a Contract with address and ABI', () => {
      const { Contract } = jest.requireMock('ethers');
      const abi = [{ name: 'transfer' }];
      service.getContract('0xABC', abi, ChainEnum.BSC);
      expect(Contract).toHaveBeenCalledWith('0xABC', abi, expect.anything());
    });
  });

  describe('rpcUrls', () => {
    it('filters out missing env vars from rpcUrls array', () => {
      delete process.env.PROVIDER_RPC_ETH_3;
      delete process.env.PROVIDER_RPC_ETH_4;
      delete process.env.PROVIDER_RPC_ETH_5;
      const svc = new ProviderService();
      expect(svc.rpcUrls).toEqual(['http://eth-1.test', 'http://eth-2.test']);
    });
  });
});
