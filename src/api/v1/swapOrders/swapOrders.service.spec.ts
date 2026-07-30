import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupportedWalletChain } from '../common/enums/chain.enum';
import { SwapOrderService } from './swapOrders.service';

describe('SwapOrderService wallet ownership', () => {
  const repository = {
    findByWalletWithPagination: jest.fn(),
    findByTxHashForWallet: jest.fn(),
  };
  const walletService = {
    verifyWalletForDevice: jest.fn(),
  };
  const nearIntentPollerService = {
    startPolling: jest.fn(),
  };
  const verifiedWallet = (address: string) =>
    ({
      addresses: new Map([[SupportedWalletChain.eth, address]]),
    }) as any;

  let service: SwapOrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SwapOrderService(
      {} as any,
      repository as any,
      walletService as any,
      nearIntentPollerService as any,
    );
  });

  it('returns wallet orders across devices after the wallet is associated with the device', async () => {
    const query = {
      address: '0x1234567890123456789012345678901234567890',
      page: 1,
      limit: 10,
    };
    const result = { ok: true, data: { data: [], total: 0 } };
    walletService.verifyWalletForDevice.mockResolvedValue({
      walletId: 'wallet-id',
      address: query.address,
    });
    repository.findByWalletWithPagination.mockResolvedValue(result);

    await expect(
      service.findOrdersForDeviceWallet('device-id', query),
    ).resolves.toBe(result);

    expect(walletService.verifyWalletForDevice).toHaveBeenCalledWith(
      'device-id',
      query.address,
    );
    expect(repository.findByWalletWithPagination).toHaveBeenCalledWith(
      query.address,
      query,
    );
  });

  it('applies the verified wallet before looking up order history', async () => {
    const query = {
      address: '0x9999999999999999999999999999999999999999',
      page: 1,
      limit: 10,
    };
    const walletAddress = '0x1234567890123456789012345678901234567890';
    const result = { ok: true, data: { data: [], total: 0 } };
    walletService.verifyWalletForDevice.mockResolvedValue({
      walletId: 'wallet-id',
      address: walletAddress,
    });
    repository.findByWalletWithPagination.mockResolvedValue(result);

    await expect(
      service.findOrdersForDeviceWallet(
        'device-id',
        { ...query, address: walletAddress },
        verifiedWallet(walletAddress),
      ),
    ).resolves.toBe(result);

    expect(repository.findByWalletWithPagination).toHaveBeenCalledWith(
      walletAddress,
      { ...query, address: walletAddress },
    );
  });

  it('rejects wallet order history when the wallet is not associated with the device', async () => {
    const query = {
      address: '0x1234567890123456789012345678901234567890',
      page: 1,
      limit: 10,
    };
    walletService.verifyWalletForDevice.mockResolvedValue(null);

    await expect(
      service.findOrdersForDeviceWallet('device-id', query),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.findByWalletWithPagination).not.toHaveBeenCalled();
  });

  it('returns an order by hash after the wallet is associated with the device', async () => {
    const result = { ok: true, data: null };
    walletService.verifyWalletForDevice.mockResolvedValue({
      walletId: 'wallet-id',
      address: '0x1234567890123456789012345678901234567890',
    });
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
    walletService.verifyWalletForDevice.mockRejectedValue(
      new Error('lookup failed'),
    );

    await expect(
      service.findOrdersForDeviceWallet('device-id', query),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(repository.findByWalletWithPagination).not.toHaveBeenCalled();
  });
});
