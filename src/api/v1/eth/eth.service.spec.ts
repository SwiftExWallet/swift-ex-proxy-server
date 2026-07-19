import { EthService } from './eth.service';
import { ProviderErrorCode } from '../common/utils/provider-error.util';

describe('EthService', () => {
  const originalEnv = process.env;
  let service: EthService;
  const provider = {
    broadcastTransaction: jest.fn(),
  };
  const providerService = {
    getContract: jest.fn(),
    getProvider: jest.fn(),
  };
  const uniSwapService = {
    getQuote: jest.fn(),
  };
  const ethTestnetSwapService = {
    getQuote: jest.fn(),
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      POOL_FACTORY_CONTRACT_ADDRESS:
        '0x0000000000000000000000000000000000000001',
      QUOTER_CONTRACT_ADDRESS: '0x0000000000000000000000000000000000000002',
      SWAP_ROUTER_ADDRESS: '0x0000000000000000000000000000000000000003',
    };
    jest.clearAllMocks();
    providerService.getContract.mockReturnValue({});
    providerService.getProvider.mockReturnValue(provider);

    service = new EthService(
      providerService as any,
      uniSwapService as any,
      ethTestnetSwapService as any,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('delegates swap quotes to testnet service in dev environment', async () => {
    process.env.ENVIRONMENT = 'dev';
    const quote = { outputAmount: '1' };
    ethTestnetSwapService.getQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote({} as any)).resolves.toBe(quote);
    expect(ethTestnetSwapService.getQuote).toHaveBeenCalledWith({});
    expect(uniSwapService.getQuote).not.toHaveBeenCalled();
  });

  it('delegates swap quotes to Uniswap service outside dev environment', async () => {
    process.env.ENVIRONMENT = 'prod';
    const quote = { outputAmount: '1' };
    uniSwapService.getQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote({} as any)).resolves.toBe(quote);
    expect(uniSwapService.getQuote).toHaveBeenCalledWith({});
    expect(ethTestnetSwapService.getQuote).not.toHaveBeenCalled();
  });

  it('returns a stable provider error when broadcast fails', async () => {
    provider.broadcastTransaction.mockRejectedValue({
      message: 'upstream RPC revealed internal node details',
    });

    await expect(
      service.broadcastTransaction({
        signedTx: '0xsigned',
        broadcastChain: 'ETH',
      } as any),
    ).rejects.toMatchObject({
      response: {
        code: ProviderErrorCode.TransactionRejected,
        message: 'Provider rejected the transaction.',
      },
    });
  });
});
