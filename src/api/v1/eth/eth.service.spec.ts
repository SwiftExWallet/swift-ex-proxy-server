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
  const tokenMetadataService = {
    normalizeSwapQuote: jest.fn(),
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
      tokenMetadataService as any,
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
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue({});
    ethTestnetSwapService.getQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote({} as any)).resolves.toBe(quote);
    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith({});
    expect(ethTestnetSwapService.getQuote).toHaveBeenCalledWith({});
    expect(uniSwapService.getQuote).not.toHaveBeenCalled();
  });

  it('delegates swap quotes to Uniswap service outside dev environment', async () => {
    process.env.ENVIRONMENT = 'prod';
    const quote = { outputAmount: '1' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue({});
    uniSwapService.getQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote({} as any)).resolves.toBe(quote);
    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith({});
    expect(uniSwapService.getQuote).toHaveBeenCalledWith({});
    expect(ethTestnetSwapService.getQuote).not.toHaveBeenCalled();
  });

  it('normalizes token metadata before quoting without a verified wallet', async () => {
    process.env.ENVIRONMENT = 'prod';
    const dto = {
      amount: '1',
      recipient: '0x1111111111111111111111111111111111111111',
      tokenIn: {
        address: '0x2222222222222222222222222222222222222222',
        chainId: 1,
        symbol: 'FAKE',
        decimals: '99',
      },
      tokenOut: {
        address: '0x3333333333333333333333333333333333333333',
        chainId: 1,
        symbol: 'ALSO_FAKE',
        decimals: '1',
      },
    };
    const normalizedDto = {
      ...dto,
      tokenIn: {
        address: dto.tokenIn.address,
        chainId: dto.tokenIn.chainId,
        symbol: 'WETH',
        decimals: '18',
      },
      tokenOut: {
        address: dto.tokenOut.address,
        chainId: dto.tokenOut.chainId,
        symbol: 'USDC',
        decimals: '6',
      },
    };
    const quote = { outputAmount: '1' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(normalizedDto);
    uniSwapService.getQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote(dto as any)).resolves.toBe(quote);

    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith(dto);
    expect(uniSwapService.getQuote).toHaveBeenCalledWith(normalizedDto);
  });

  it('does not derive the quote recipient from the verified wallet', async () => {
    process.env.ENVIRONMENT = 'prod';
    const dto = {
      amount: '1',
      recipient: '0x1111111111111111111111111111111111111111',
      tokenIn: {
        address: '0x2222222222222222222222222222222222222222',
        chainId: 1,
      },
      tokenOut: {
        address: '0x3333333333333333333333333333333333333333',
        chainId: 1,
      },
    };
    const normalizedDto = {
      ...dto,
      tokenIn: { ...dto.tokenIn, symbol: 'WETH', decimals: '18' },
      tokenOut: { ...dto.tokenOut, symbol: 'USDC', decimals: '6' },
    };
    const quote = { outputAmount: '1' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(normalizedDto);
    uniSwapService.getQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote(dto as any)).resolves.toBe(quote);

    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith(dto);
    expect(uniSwapService.getQuote).toHaveBeenCalledWith(normalizedDto);
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
