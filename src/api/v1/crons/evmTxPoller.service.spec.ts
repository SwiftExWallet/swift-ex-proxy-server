import { Logger } from '@nestjs/common';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { EvmTxPollerService } from './evmTxPoller.service';

describe('EvmTxPollerService', () => {
  let service: EvmTxPollerService;
  let swapOrderService: {
    findPendingByProvider: jest.Mock;
    updateOrderByHash: jest.Mock;
  };
  let exhaustedOrderService: {
    upsertByTxHash: jest.Mock;
  };
  let firebaseNotificationService: {
    sendNotification: jest.Mock;
  };
  let redisService: {
    getKey: jest.Mock;
    setKey: jest.Mock;
    delKey: jest.Mock;
  };
  let txReceiptStatusService: {
    getStatus: jest.Mock;
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

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    swapOrderService = {
      findPendingByProvider: jest.fn(),
      updateOrderByHash: jest.fn(),
    };
    exhaustedOrderService = {
      upsertByTxHash: jest.fn().mockResolvedValue(undefined),
    };
    firebaseNotificationService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    redisService = {
      getKey: jest.fn().mockResolvedValue(null),
      setKey: jest.fn().mockResolvedValue(undefined),
      delKey: jest.fn().mockResolvedValue(undefined),
    };
    txReceiptStatusService = {
      getStatus: jest.fn(),
    };
    service = new EvmTxPollerService(
      swapOrderService as any,
      exhaustedOrderService as any,
      firebaseNotificationService as any,
      redisService as any,
      txReceiptStatusService as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries pending EVM transaction swap orders', async () => {
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [],
    });

    await service.poll();

    expect(swapOrderService.findPendingByProvider).toHaveBeenCalledWith(
      swapProvider.EVMTX,
    );
    expect(txReceiptStatusService.getStatus).not.toHaveBeenCalled();
  });

  it('returns without polling when service fetch fails', async () => {
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: false,
      error: 'db failed',
    });

    await service.poll();

    expect(txReceiptStatusService.getStatus).not.toHaveBeenCalled();
    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
  });

  it('returns without polling when there are no pending orders', async () => {
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [],
    });

    await service.poll();

    expect(txReceiptStatusService.getStatus).not.toHaveBeenCalled();
    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
  });

  it('maps a successful Blockscout receipt to completed and sends a notification', async () => {
    const tx = createTx();
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [tx],
    });
    txReceiptStatusService.getStatus.mockResolvedValue(
      SwapOrderStatus.COMPLETED,
    );
    swapOrderService.updateOrderByHash.mockResolvedValue({
      ...tx,
      txType: 'Swap',
    });

    await service.poll();

    expect(txReceiptStatusService.getStatus).toHaveBeenCalledWith(
      tx.fromChain,
      tx.txHash,
    );
    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: tx.txHash,
      orderStatus: SwapOrderStatus.COMPLETED,
    });
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
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [tx],
    });
    txReceiptStatusService.getStatus.mockResolvedValue(SwapOrderStatus.FAILED);
    swapOrderService.updateOrderByHash.mockResolvedValue({
      ...tx,
      txType: 'Swap',
    });

    await service.poll();

    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: tx.txHash,
      orderStatus: SwapOrderStatus.FAILED,
    });
  });

  it('backs off unresolved transactions before exhausting them', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const tx = createTx();
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [tx],
    });
    txReceiptStatusService.getStatus.mockResolvedValue(null);

    await service.poll();

    expect(redisService.setKey).toHaveBeenCalledWith(
      'evm_tx_poll:0xhash',
      JSON.stringify({ attempts: 1, nextPollAt: 1_030_000 }),
      1800,
    );
    expect(swapOrderService.updateOrderByHash).not.toHaveBeenCalled();
    expect(exhaustedOrderService.upsertByTxHash).not.toHaveBeenCalled();
  });

  it('skips a transaction while its backoff window is still active', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    redisService.getKey.mockResolvedValue(
      JSON.stringify({ attempts: 2, nextPollAt: 1_010_000 }),
    );
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [createTx()],
    });

    await service.poll();

    expect(txReceiptStatusService.getStatus).not.toHaveBeenCalled();
    expect(redisService.setKey).not.toHaveBeenCalled();
  });

  it('marks unresolved transactions exhausted after max attempts', async () => {
    const tx = createTx();
    redisService.getKey.mockResolvedValue(
      JSON.stringify({ attempts: 4, nextPollAt: 0 }),
    );
    swapOrderService.findPendingByProvider.mockResolvedValue({
      ok: true,
      data: [tx],
    });
    txReceiptStatusService.getStatus.mockResolvedValue(null);

    await service.poll();

    expect(swapOrderService.updateOrderByHash).toHaveBeenCalledWith({
      txHash: tx.txHash,
      orderStatus: SwapOrderStatus.EXHAUSTED,
    });
    expect(exhaustedOrderService.upsertByTxHash).toHaveBeenCalledWith(
      tx.txHash,
      {
        provider: swapProvider.EVMTX,
        deviceFcmToken: tx.deviceFcmToken,
      },
    );
    expect(redisService.delKey).toHaveBeenCalledWith('evm_tx_poll:0xhash');
  });
});
