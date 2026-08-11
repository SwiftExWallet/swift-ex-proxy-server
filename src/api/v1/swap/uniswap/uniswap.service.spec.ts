jest.mock('@uniswap/smart-order-router', () => ({
  AlphaRouter: jest.fn(),
  SwapType: {
    SWAP_ROUTER_02: 'SWAP_ROUTER_02',
  },
}));

jest.mock('axios', () => ({
  ...jest.requireActual('axios'),
  __esModule: true,
  default: {
    ...jest.requireActual('axios').default,
    post: jest.fn(),
  },
}));

import axios from 'axios';
import { ChainId } from '../../common/enums/chain.enum';
import { ResolvedSwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { ProviderErrorCode } from '../../common/utils/provider-error.util';
import { UniswapService } from './uniswap.service';

describe('UniswapService', () => {
  const providerService = {
    getChainRpcUrl: jest.fn(),
  };
  const tokenMetadataService = {
    normalizeSwapQuote: jest.fn(),
  };
  let service: UniswapService;

  const resolvedDto = {
    tokenIn: {
      address: '0x1111111111111111111111111111111111111111',
      symbol: 'ETH',
      decimals: '18',
      chainId: ChainId.ETH,
    },
    tokenOut: {
      address: '0x2222222222222222222222222222222222222222',
      symbol: 'USDC',
      decimals: '6',
      chainId: ChainId.ETH,
    },
    amount: '1',
    recipient: '0x3333333333333333333333333333333333333333',
  } as ResolvedSwapQuoteDto;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.UNISWAP_API_KEY;
    delete process.env.UNISWAP_API_BASE_URL;
    service = new UniswapService(
      providerService as any,
      tokenMetadataService as any,
    );
  });

  it('posts cross-chain gas-paid quote requests to the Trading API', async () => {
    const crossChainDto = {
      ...resolvedDto,
      tokenOut: {
        ...resolvedDto.tokenOut,
        chainId: ChainId.BSC,
      },
      slippage: 1,
    };
    const quote = { routing: 'CHAINED', quoteId: 'uniswap-cross-chain' };
    process.env.UNISWAP_API_KEY = 'test-uniswap-api-key';
    process.env.UNISWAP_API_BASE_URL =
      'https://trade-api.gateway.uniswap.org/v1';
    (axios.post as jest.Mock).mockResolvedValue({ data: quote });

    await expect(service.getSwapQuote(crossChainDto)).resolves.toEqual(quote);

    expect(axios.post).toHaveBeenCalledWith(
      'https://trade-api.gateway.uniswap.org/v1/quote',
      {
        amount: '1000000000000000000',
        slippageTolerance: 1,
        swapper: crossChainDto.recipient,
        tokenIn: crossChainDto.tokenIn.address,
        tokenInChainId: ChainId.ETH,
        tokenOut: crossChainDto.tokenOut.address,
        tokenOutChainId: ChainId.BSC,
        type: 'EXACT_INPUT',
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: 'application/json',
          'content-type': 'application/json',
          'x-api-key': 'test-uniswap-api-key',
        }),
      }),
    );
  });

  it('returns stable provider errors when swap transaction build fails upstream', async () => {
    jest
      .spyOn(service, 'getQuote')
      .mockRejectedValue(new Error('private provider route failure'));

    await expect(service.buildSwapTx(resolvedDto)).rejects.toMatchObject({
      response: {
        code: ProviderErrorCode.RouteNotFound,
        message: 'No provider route was found for this request.',
      },
    });
  });

  it('normalizes and wraps swap transaction builds', async () => {
    const txs = [{ to: '0x4444444444444444444444444444444444444444' }];
    tokenMetadataService.normalizeSwapQuote.mockResolvedValue(resolvedDto);
    jest.spyOn(service, 'buildSwapTx').mockResolvedValue(txs as any);

    await expect(service.buildSwapResponse(resolvedDto)).resolves.toEqual({
      success: true,
      data: txs,
    });

    expect(tokenMetadataService.normalizeSwapQuote).toHaveBeenCalledWith(
      resolvedDto,
    );
    expect(service.buildSwapTx).toHaveBeenCalledWith(resolvedDto);
  });
});
