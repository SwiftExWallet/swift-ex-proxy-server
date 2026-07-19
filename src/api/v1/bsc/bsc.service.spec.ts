import { BscService } from './bsc.service';

describe('BscService', () => {
  const originalEnv = process.env;
  let service: BscService;
  const provider = {
    broadcastTransaction: jest.fn(),
  };
  const routerContract = {
    getAmountsOut: jest.fn(),
  };
  const providerService = {
    getProvider: jest.fn(),
    getContract: jest.fn(),
  };
  const pancakeSwapService = {
    getSwapQuote: jest.fn(),
    createUnsignedSwapTransaction: jest.fn(),
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BSC_ROUTER_ADDRESS: '0x0000000000000000000000000000000000000001',
    };
    jest.clearAllMocks();
    providerService.getProvider.mockReturnValue(provider);
    providerService.getContract.mockReturnValue(routerContract);

    service = new BscService(providerService as any, pancakeSwapService as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('delegates swap quotes to PancakeSwap service in prod', async () => {
    process.env.ENVIRONMENT = 'prod';
    const quote = { outputAmount: '1' };
    pancakeSwapService.getSwapQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote({} as any)).resolves.toBe(quote);
    expect(pancakeSwapService.getSwapQuote).toHaveBeenCalledWith({});
  });

  it('delegates swap transaction preparation to PancakeSwap service in prod', async () => {
    process.env.ENVIRONMENT = 'prod';
    const txs = [{ to: '0xrouter' }];
    pancakeSwapService.createUnsignedSwapTransaction.mockResolvedValue(txs);

    await expect(service.prepareSwapTransaction({} as any)).resolves.toBe(txs);
    expect(
      pancakeSwapService.createUnsignedSwapTransaction,
    ).toHaveBeenCalledWith({});
  });
});
