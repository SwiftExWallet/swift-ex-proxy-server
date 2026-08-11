import { UniswapController } from './uniswap.controller';
import { SwapQuoteDto } from '../../common/dto/swapQuote.dto';
import { RATE_LIMIT_KEY } from '../../common/decorators/rate-limit.decorator';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../../common/decorators/body-size-limit.decorator';

describe('UniswapController', () => {
  const uniswapService = {
    buildSwapResponse: jest.fn(),
  };

  let controller: UniswapController;

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
    controller = new UniswapController(uniswapService as any);
  });

  it('delegates swap build requests to the Uniswap service', async () => {
    const result = { success: true, data: [{ to: dto.recipient }] };
    uniswapService.buildSwapResponse.mockResolvedValue(result);

    await expect(controller.swapBuild(req, dto)).resolves.toBe(result);

    expect(uniswapService.buildSwapResponse).toHaveBeenCalledWith(
      dto,
      req.wallet,
    );
  });

  it('applies IP, device, and wallet rate limits to swap build requests', () => {
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, controller.swapBuild)).toEqual([
      { points: 30, duration: 60, key: 'uniswap-swap-ip', keyBy: 'ip' },
      {
        points: 15,
        duration: 60,
        key: 'uniswap-swap-device',
        keyBy: 'device',
      },
      {
        points: 15,
        duration: 60,
        key: 'uniswap-swap-wallet',
        keyBy: 'wallet',
      },
    ]);
  });

  it('applies route-specific body size limits to swap build requests', () => {
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.swapBuild),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.standard,
      key: 'uniswap-swap',
    });
  });
});
