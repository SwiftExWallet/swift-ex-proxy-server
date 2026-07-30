import { SwapOrdersController } from './swapOrders.controller';
import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import {
  BODY_SIZE_LIMIT_KEY,
  BODY_SIZE_LIMITS,
} from '../common/decorators/body-size-limit.decorator';

describe('SwapOrdersController', () => {
  const swapOrderService = {
    store: jest.fn(),
    findOrdersForDeviceWallet: jest.fn(),
    findOrderByHashForDeviceWallet: jest.fn(),
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
    swapOrderService.findOrdersForDeviceWallet.mockResolvedValue(result);

    await expect(controller.orderByWallet(req, query)).resolves.toBe(result);

    expect(swapOrderService.findOrdersForDeviceWallet).toHaveBeenCalledWith(
      'device-id',
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
    swapOrderService.findOrderByHashForDeviceWallet.mockResolvedValue(result);

    await expect(
      controller.getOrderByOrderhash(req, '0xorderhash', {
        address: '0x1234567890123456789012345678901234567890',
      }),
    ).resolves.toBe(result);

    expect(
      swapOrderService.findOrderByHashForDeviceWallet,
    ).toHaveBeenCalledWith(
      'device-id',
      '0xorderhash',
      {
        address: '0x1234567890123456789012345678901234567890',
      },
      req.wallet,
    );
  });

  it('applies wallet-scoped limits to order reads and device limits to bridge status', () => {
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
    expect(
      Reflect.getMetadata(RATE_LIMIT_KEY, controller.bridgeOrderStatus),
    ).toEqual([
      {
        points: 60,
        duration: 60,
        key: 'swap-orders-bridge-status-ip',
        keyBy: 'ip',
      },
      {
        points: 30,
        duration: 60,
        key: 'swap-orders-bridge-status-device',
        keyBy: 'device',
      },
    ]);
  });

  it('applies route-specific body size limits to write routes', () => {
    expect(Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.store)).toEqual({
      maxBytes: BODY_SIZE_LIMITS.swapOrder,
      key: 'swap-orders-store',
    });
    expect(
      Reflect.getMetadata(BODY_SIZE_LIMIT_KEY, controller.bridgeOrderStatus),
    ).toEqual({
      maxBytes: BODY_SIZE_LIMITS.simple,
      key: 'swap-orders-bridge-status',
    });
  });
});
