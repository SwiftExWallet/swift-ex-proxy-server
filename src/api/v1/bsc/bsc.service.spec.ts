import { BscService } from './bsc.service';
import { ProviderErrorCode } from '../common/utils/provider-error.util';

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
  const tokenMetadataService = {
    normalizeSwapQuote: jest.fn(),
  };
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BSC_ROUTER_ADDRESS: '0x0000000000000000000000000000000000000001',
      PROVIDER_RETRY_MAX_ATTEMPTS: '1',
    };
    jest.clearAllMocks();
    providerService.getProvider.mockReturnValue(provider);
    providerService.getContract.mockReturnValue(routerContract);

    service = new BscService(
      providerService as any,
      pancakeSwapService as any,
      tokenMetadataService as any,
    );
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
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue({});
    pancakeSwapService.getSwapQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote({} as any)).resolves.toBe(quote);
    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith({});
    expect(pancakeSwapService.getSwapQuote).toHaveBeenCalledWith({});
  });

  it('normalizes token metadata before quoting without a verified wallet', async () => {
    process.env.ENVIRONMENT = 'prod';
    const dto = {
      amount: '1',
      recipient: '0x1111111111111111111111111111111111111111',
      tokenIn: {
        address: '0x2222222222222222222222222222222222222222',
        chainId: 56,
        symbol: 'FAKE',
        decimals: '99',
      },
      tokenOut: {
        address: '0x3333333333333333333333333333333333333333',
        chainId: 56,
        symbol: 'ALSO_FAKE',
        decimals: '1',
      },
    };
    const normalizedDto = {
      ...dto,
      tokenIn: {
        address: dto.tokenIn.address,
        chainId: dto.tokenIn.chainId,
        symbol: 'WBNB',
        decimals: '18',
      },
      tokenOut: {
        address: dto.tokenOut.address,
        chainId: dto.tokenOut.chainId,
        symbol: 'USDT',
        decimals: '18',
      },
    };
    const quote = { outputAmount: '1' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(normalizedDto);
    pancakeSwapService.getSwapQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote(dto as any)).resolves.toBe(quote);

    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith(dto);
    expect(pancakeSwapService.getSwapQuote).toHaveBeenCalledWith(normalizedDto);
  });

  it('does not derive the quote recipient from the verified wallet', async () => {
    process.env.ENVIRONMENT = 'prod';
    const dto = {
      amount: '1',
      recipient: '0x1111111111111111111111111111111111111111',
      tokenIn: {
        address: '0x2222222222222222222222222222222222222222',
        chainId: 56,
      },
      tokenOut: {
        address: '0x3333333333333333333333333333333333333333',
        chainId: 56,
      },
    };
    const normalizedDto = {
      ...dto,
      tokenIn: { ...dto.tokenIn, symbol: 'WBNB', decimals: '18' },
      tokenOut: { ...dto.tokenOut, symbol: 'USDT', decimals: '18' },
    };
    const quote = { outputAmount: '1' };
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(normalizedDto);
    pancakeSwapService.getSwapQuote.mockResolvedValue(quote);

    await expect(service.getSwapQuote(dto as any)).resolves.toBe(quote);

    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith(dto);
    expect(pancakeSwapService.getSwapQuote).toHaveBeenCalledWith(normalizedDto);
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

  it('returns a stable provider error when broadcast fails', async () => {
    provider.broadcastTransaction.mockRejectedValue({
      info: {
        error: {
          message: 'private BSC RPC rejection detail',
        },
      },
    });

    await expect(
      service.broadcastTransaction({
        signedTx: '0xsigned',
      } as any),
    ).rejects.toMatchObject({
      response: {
        code: ProviderErrorCode.TransactionRejected,
        message: 'Provider rejected the transaction.',
      },
    });
  });
});
