import { SwapOrdersController } from './swapOrders.controller';

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

  it('gets orders for the verified wallet on the authenticated device', async () => {
    const req = {
      device: { _id: 'device-id' },
      wallet: { address: '0x1234567890123456789012345678901234567890' },
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
      {
        ...query,
        address: req.wallet.address,
      },
    );
  });

  it('gets an order only when the tx hash matches the verified wallet and device', async () => {
    const req = {
      device: { _id: 'device-id' },
      wallet: { address: '0x1234567890123456789012345678901234567890' },
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
    ).toHaveBeenCalledWith('device-id', '0xorderhash', req.wallet.address);
  });
});
