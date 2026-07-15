import { SwapOrdersController } from './swapOrders.controller';

describe('SwapOrdersController', () => {
  const swapOrderService = {
    findOrdersForDeviceWallet: jest.fn(),
    findOrderByHashForDeviceWallet: jest.fn(),
  };

  let controller: SwapOrdersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SwapOrdersController(swapOrderService as any);
  });

  it('gets orders for the requested wallet across devices', async () => {
    const req = { device: { _id: 'device-id' } };
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
    );
  });

  it('gets an order only when the tx hash matches the requested wallet', async () => {
    const req = { device: { _id: 'device-id' } };
    const result = { ok: true, data: null };
    swapOrderService.findOrderByHashForDeviceWallet.mockResolvedValue(result);

    await expect(
      controller.getOrderByOrderhash(req, '0xorderhash', {
        address: '0x1234567890123456789012345678901234567890',
      }),
    ).resolves.toBe(result);

    expect(swapOrderService.findOrderByHashForDeviceWallet).toHaveBeenCalledWith(
      'device-id',
      '0xorderhash',
      '0x1234567890123456789012345678901234567890',
    );
  });
});
