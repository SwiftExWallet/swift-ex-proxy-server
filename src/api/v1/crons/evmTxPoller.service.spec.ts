import { Logger } from '@nestjs/common';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { EvmTxPollerService } from './evmTxPoller.service';

describe('EvmTxPollerService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  let service: EvmTxPollerService;
  let repo: {
    findPendingByProvider: jest.Mock;
    updateOrderStatus: jest.Mock;
  };
  let firebaseNotificationService: {
    sendNotification: jest.Mock;
  };

  const createTx = (overrides: Record<string, any> = {}) =>
    ({
      txHash: '0xhash',
      fromChain: 'ETH',
      walletAddress: '0x1234567890123456789012345678901234567890',
      amountOut: '10',
      toToken: 'USDC',
      deviceFcmToken: 'fcm-token',
      txType: 'Swap',
      ...overrides,
    }) as any;

  const mockFetchReceipt = (receipt: Record<string, any>) => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(receipt),
    });
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BLOCKSCOUT_ETH: 'https://blockscout.eth',
      BLOCKSCOUT_ALLOWED_HOSTS: 'blockscout.eth',
    };
    (global as any).fetch = jest.fn();

    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    repo = {
      findPendingByProvider: jest.fn(),
      updateOrderStatus: jest.fn(),
    };
    firebaseNotificationService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    service = new EvmTxPollerService(
      repo as any,
      firebaseNotificationService as any,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
    (global as any).fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('queries pending EVM transaction swap orders', async () => {
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [] });

    await service.poll();

    expect(repo.findPendingByProvider).toHaveBeenCalledWith(swapProvider.EVMTX);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects unallowlisted Blockscout URLs during construction', () => {
    process.env.BLOCKSCOUT_ALLOWED_HOSTS = 'blockscout.eth';
    process.env.BLOCKSCOUT_ETH = 'https://evil.example';

    expect(
      () =>
        new EvmTxPollerService(repo as any, firebaseNotificationService as any),
    ).toThrow('BLOCKSCOUT_ETH host is not allowlisted');
  });

  it('returns without polling when repository fetch fails', async () => {
    repo.findPendingByProvider.mockResolvedValue({
      ok: false,
      error: 'db failed',
    });

    await service.poll();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(repo.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('returns without polling when there are no pending orders', async () => {
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [] });

    await service.poll();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(repo.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('maps a successful Blockscout receipt to completed and sends a notification', async () => {
    const tx = createTx();
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [tx] });
    repo.updateOrderStatus.mockResolvedValue({ ...tx, txType: 'Swap' });
    mockFetchReceipt({
      status: '1',
      message: 'OK',
      result: { status: '1' },
    });

    await service.poll();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://blockscout.eth/api?module=transaction&action=gettxreceiptstatus&txhash=0xhash',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(Object),
      }),
    );
    expect(repo.updateOrderStatus).toHaveBeenCalledWith(
      tx.txHash,
      SwapOrderStatus.COMPLETED,
    );
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledWith(
      tx.deviceFcmToken,
      {
        title: `Order Completed: ${tx.amountOut} ${tx.toToken}`,
        body: 'From 0x12.....7890',
        data: { network: tx.fromChain, txHash: tx.txHash },
      },
    );
  });

  it('maps a failed Blockscout receipt to failed status', async () => {
    const tx = createTx();
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [tx] });
    repo.updateOrderStatus.mockResolvedValue({ ...tx, txType: 'Swap' });
    mockFetchReceipt({
      status: '1',
      message: 'OK',
      result: { status: '0' },
    });

    await service.poll();

    expect(repo.updateOrderStatus).toHaveBeenCalledWith(
      tx.txHash,
      SwapOrderStatus.FAILED,
    );
  });

  it('retries retryable Blockscout HTTP failures before processing a receipt', async () => {
    process.env.PROVIDER_RETRY_MAX_ATTEMPTS = '2';
    process.env.PROVIDER_RETRY_BASE_DELAY_MS = '1';
    process.env.PROVIDER_RETRY_MAX_DELAY_MS = '1';
    const tx = createTx();
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [tx] });
    repo.updateOrderStatus.mockResolvedValue({ ...tx, txType: 'Swap' });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          status: '1',
          message: 'OK',
          result: { status: '1' },
        }),
      });

    await service.poll();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(repo.updateOrderStatus).toHaveBeenCalledWith(
      tx.txHash,
      SwapOrderStatus.COMPLETED,
    );
  });
});
