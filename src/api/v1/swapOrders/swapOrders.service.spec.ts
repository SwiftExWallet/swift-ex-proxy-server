import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { SwapOrderService } from './swapOrders.service';

describe('SwapOrderService wallet ownership', () => {
  const repository = {
    walletBelongsToDevice: jest.fn(),
    findByWalletWithPagination: jest.fn(),
    findByTxHashForWallet: jest.fn(),
  };

  let service: SwapOrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SwapOrderService(
      {} as any,
      repository as any,
      {} as any,
      {} as any,
    );
  });

  it('returns all orders for a wallet after the wallet is associated with the device', async () => {
    const query = {
      address: '0x1234567890123456789012345678901234567890',
      page: 1,
      limit: 10,
    };
    const result = { ok: true, data: { data: [], total: 0 } };
    repository.walletBelongsToDevice.mockResolvedValue({ ok: true, data: true });
    repository.findByWalletWithPagination.mockResolvedValue(result);

    await expect(service.findOrdersForDeviceWallet('device-id', query)).resolves.toBe(result);

    expect(repository.walletBelongsToDevice).toHaveBeenCalledWith(
      'device-id',
      query.address,
    );
    expect(repository.findByWalletWithPagination).toHaveBeenCalledWith(
      query.address,
      query,
    );
  });

  it('rejects wallet order history when the wallet is not associated with the device', async () => {
    const query = {
      address: '0x1234567890123456789012345678901234567890',
      page: 1,
      limit: 10,
    };
    repository.walletBelongsToDevice.mockResolvedValue({ ok: true, data: false });

    await expect(service.findOrdersForDeviceWallet('device-id', query)).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.findByWalletWithPagination).not.toHaveBeenCalled();
  });

  it('returns an order by hash after the wallet is associated with the device', async () => {
    const result = { ok: true, data: null };
    repository.walletBelongsToDevice.mockResolvedValue({ ok: true, data: true });
    repository.findByTxHashForWallet.mockResolvedValue(result);

    await expect(
      service.findOrderByHashForDeviceWallet(
        'device-id',
        '0xorderhash',
        '0x1234567890123456789012345678901234567890',
      ),
    ).resolves.toBe(result);

    expect(repository.findByTxHashForWallet).toHaveBeenCalledWith(
      '0xorderhash',
      '0x1234567890123456789012345678901234567890',
    );
  });

  it('fails closed when wallet ownership cannot be verified', async () => {
    const query = {
      address: '0x1234567890123456789012345678901234567890',
      page: 1,
      limit: 10,
    };
    repository.walletBelongsToDevice.mockResolvedValue({ ok: false, error: 'lookup failed' });

    await expect(service.findOrdersForDeviceWallet('device-id', query)).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(repository.findByWalletWithPagination).not.toHaveBeenCalled();
  });
});
