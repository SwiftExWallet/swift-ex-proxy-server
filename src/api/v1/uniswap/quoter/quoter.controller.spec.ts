jest.mock('@uniswap/smart-order-router', () => ({
  AlphaRouter: jest.fn(),
  SwapType: {
    SWAP_ROUTER_02: 'SWAP_ROUTER_02',
  },
}));

import { QuoterController } from './quoter.controller';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';

describe('QuoterController', () => {
  const quoterService = {
    getQuoteResponse: jest.fn(),
    buildSwapResponse: jest.fn(),
  };

  let controller: QuoterController;

  const dto = {
    tokenIn: {
      address: '0x1111111111111111111111111111111111111111',
      symbol: 'ETH',
      decimals: '18',
      chainId: 1,
    },
    tokenOut: {
      address: '0x2222222222222222222222222222222222222222',
      symbol: 'USDC',
      decimals: '6',
      chainId: 1,
    },
    amount: '1',
    recipient: '0x3333333333333333333333333333333333333333',
  } as SwapQuoteDto;
  const req = {
    wallet: {
      address: '0x3333333333333333333333333333333333333333',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new QuoterController(quoterService as any);
  });

  it('delegates quote requests to the quoter service', async () => {
    const result = { success: true, provider: 'UNISWAP', data: { fee: '3000' } };
    quoterService.getQuoteResponse.mockResolvedValue(result);

    await expect(controller.getQuote(req, dto)).resolves.toBe(result);

    expect(quoterService.getQuoteResponse).toHaveBeenCalledWith({
      ...dto,
      recipient: req.wallet.address,
    });
  });

  it('delegates swap build requests to the quoter service', async () => {
    const result = { success: true, data: [{ to: dto.recipient }] };
    quoterService.buildSwapResponse.mockResolvedValue(result);

    await expect(controller.swapBuild(req, dto)).resolves.toBe(result);

    expect(quoterService.buildSwapResponse).toHaveBeenCalledWith({
      ...dto,
      recipient: req.wallet.address,
    });
  });
});
