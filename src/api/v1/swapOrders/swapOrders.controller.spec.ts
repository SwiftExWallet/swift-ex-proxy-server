import { SwapOrdersController } from './swapOrders.controller';
import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

describe('SwapOrdersController', () => {
  const swapOrderService = {
    store: jest.fn(),
    findOrdersForVerifiedWallet: jest.fn(),
    findOrderByHashForVerifiedWallet: jest.fn(),
  };

  let controller: SwapOrdersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SwapOrdersController(swapOrderService as any);
  });

  it('gets orders for the verified wallet after authenticating the device wallet', async () => {
    const req = {
      device: { _id: 'device-id' },
      wallet: {
        addresses: {
          eth: '0x1234567890123456789012345678901234567890',
          multi: '0x1234567890123456789012345678901234567890',
        },
      },
    };
    const query = {
      address: '0x1234567890123456789012345678901234567890',
      page: 1,
      limit: 10,
    };
    const result = { ok: true, data: { data: [], total: 0 } };
    swapOrderService.findOrdersForVerifiedWallet.mockResolvedValue(result);

    await expect(controller.orderByWallet(req, query)).resolves.toBe(result);

    expect(swapOrderService.findOrdersForVerifiedWallet).toHaveBeenCalledWith(
      query,
      req.wallet,
    );
  });

  it('gets an order only when the tx hash matches the verified wallet', async () => {
    const req = {
      device: { _id: 'device-id' },
      wallet: {
        addresses: {
          eth: '0x1234567890123456789012345678901234567890',
          multi: '0x1234567890123456789012345678901234567890',
        },
      },
    };
    const result = { ok: true, data: null };
    swapOrderService.findOrderByHashForVerifiedWallet.mockResolvedValue(result);

    await expect(
      controller.getOrderByOrderhash(req, '0xorderhash', {
        address: '0x1234567890123456789012345678901234567890',
      }),
    ).resolves.toBe(result);

    expect(
      swapOrderService.findOrderByHashForVerifiedWallet,
    ).toHaveBeenCalledWith(
      '0xorderhash',
      {
        address: '0x1234567890123456789012345678901234567890',
      },
      req.wallet,
    );
  });

  it('applies wallet-scoped limits to order reads', () => {
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.orderByWallet),
    ).toEqual([
      {
        points: 120,
        duration: 60,
        key: 'swap-orders-by-wallet-ip',
        keyBy: 'ip',
      },
      {
        points: 60,
        duration: 60,
        key: 'swap-orders-by-wallet-device',
        keyBy: 'device',
      },
      {
        points: 60,
        duration: 60,
        key: 'swap-orders-by-wallet-wallet',
        keyBy: 'wallet',
      },
    ]);
  });

  it('applies route-specific body size limits to write routes', () => {
    expect(Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.store)).toEqual({
      maxBytes: BODY_SIZE_LIMITS.swapOrder,
      key: 'swap-orders-store',
    });
  });
});
