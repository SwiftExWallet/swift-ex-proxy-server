jest.mock('@uniswap/smart-order-router', () => ({
  AlphaRouter: jest.fn(),
  SwapType: {
    SWAP_ROUTER_02: 'SWAP_ROUTER_02',
  },
}));

import { QuoterController } from './quoter.controller';
import { SwapQuoteDto } from '../common/dto/swapQuote.dto';
import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

describe('QuoterController', () => {
  const quoterService = {
    getQuoteResponse: jest.fn(),
    buildSwapResponse: jest.fn(),
  };

  let controller: QuoterController;

  const dto = {
    tokenIn: {
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1,
    },
    tokenOut: {
      address: '0x2222222222222222222222222222222222222222',
      chainId: 1,
    },
    amount: '1',
    recipient: '0x3333333333333333333333333333333333333333',
  } as SwapQuoteDto;
  const req = {
    wallet: {
      addresses: {
        eth: '0x3333333333333333333333333333333333333333',
        multi: '0x3333333333333333333333333333333333333333',
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new QuoterController(quoterService as any);
  });

  it('delegates quote requests to the quoter service with the verified wallet', async () => {
    const result = {
      success: true,
      provider: 'UNISWAP',
      data: { fee: '3000' },
    };
    quoterService.getQuoteResponse.mockResolvedValue(result);

    await expect(controller.getQuote(req, dto)).resolves.toBe(result);

    expect(quoterService.getQuoteResponse).toHaveBeenCalledWith(
      dto,
      req.wallet,
    );
  });

  it('delegates swap build requests to the quoter service', async () => {
    const result = { success: true, data: [{ to: dto.recipient }] };
    quoterService.buildSwapResponse.mockResolvedValue(result);

    await expect(controller.swapBuild(req, dto)).resolves.toBe(result);

    expect(quoterService.buildSwapResponse).toHaveBeenCalledWith(
      dto,
      req.wallet,
    );
  });

  it('applies IP, device, and wallet rate limits to quote requests', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.getQuote)).toEqual([
      { points: 60, duration: 60, key: 'quoter-quote-ip', keyBy: 'ip' },
      {
        points: 30,
        duration: 60,
        key: 'quoter-quote-device',
        keyBy: 'device',
      },
      {
        points: 30,
        duration: 60,
        key: 'quoter-quote-wallet',
        keyBy: 'wallet',
      },
    ]);
  });

  it('applies IP, device, and wallet rate limits to swap build requests', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.swapBuild)).toEqual([
      { points: 30, duration: 60, key: 'quoter-swap-ip', keyBy: 'ip' },
      {
        points: 15,
        duration: 60,
        key: 'quoter-swap-device',
        keyBy: 'device',
      },
      {
        points: 15,
        duration: 60,
        key: 'quoter-swap-wallet',
        keyBy: 'wallet',
      },
    ]);
  });

  it('applies route-specific body size limits to quote and swap build requests', () => {
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.getQuote),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'quoter-quote',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.swapBuild),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'quoter-swap',
    });
  });
});
