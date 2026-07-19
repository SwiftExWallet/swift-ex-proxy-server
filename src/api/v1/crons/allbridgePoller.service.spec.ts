import { Logger } from '@nestjs/common';
import {
  AllbridgeCoreSdk,
  nodeRpcUrlsDefault,
} from '@allbridge/bridge-core-sdk';
import { swapProvider } from '../common/enums/chain.enum';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { AllbridgePollerService } from './allbridgePoller.service';

const mockGetTransferStatus = jest.fn();

jest.mock('@allbridge/bridge-core-sdk', () => ({
  AllbridgeCoreSdk: jest.fn().mockImplementation(() => ({
    getTransferStatus: mockGetTransferStatus,
  })),
  nodeRpcUrlsDefault: {},
}));

describe('AllbridgePollerService', () => {
  let service: AllbridgePollerService;
  let repo: {
    findPendingByProvider: jest.Mock;
    updateStatus: jest.Mock;
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
      ...overrides,
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    repo = {
      findPendingByProvider: jest.fn(),
      updateStatus: jest.fn(),
    };
    firebaseNotificationService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    service = new AllbridgePollerService(
      repo as any,
      firebaseNotificationService as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('constructs the Allbridge SDK and queries pending Allbridge orders', async () => {
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [] });

    await service.poll();

    expect(AllbridgeCoreSdk).toHaveBeenCalledWith(nodeRpcUrlsDefault);
    expect(repo.findPendingByProvider).toHaveBeenCalledWith(
      swapProvider.ALLBRIDGE,
    );
    expect(mockGetTransferStatus).not.toHaveBeenCalled();
  });

  it('returns without SDK calls when repository fetch fails', async () => {
    repo.findPendingByProvider.mockResolvedValue({
      ok: false,
      error: 'db failed',
    });

    await service.poll();

    expect(mockGetTransferStatus).not.toHaveBeenCalled();
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('returns without SDK calls when there are no pending orders', async () => {
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [] });

    await service.poll();

    expect(mockGetTransferStatus).not.toHaveBeenCalled();
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('leaves still-bridging transfers untouched', async () => {
    const tx = createTx();
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [tx] });
    mockGetTransferStatus.mockResolvedValue({ receive: {} });

    await service.poll();

    expect(mockGetTransferStatus).toHaveBeenCalledWith(tx.fromChain, tx.txHash);
    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(firebaseNotificationService.sendNotification).not.toHaveBeenCalled();
  });

  it('maps received transfers to completed, updates order, and sends notification', async () => {
    const tx = createTx();
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [tx] });
    mockGetTransferStatus.mockResolvedValue({
      receive: { txId: '0xreceive' },
    });
    repo.updateStatus.mockResolvedValue({ ok: true, data: undefined });

    await service.poll();

    expect(repo.updateStatus).toHaveBeenCalledWith(
      tx.txHash,
      SwapOrderStatus.COMPLETED,
      null,
    );
    expect(firebaseNotificationService.sendNotification).toHaveBeenCalledWith(
      tx.deviceFcmToken,
      {
        title: `Order Completed: ${tx.amountOut} ${tx.toToken} from SDEX`,
        body: 'From 0x12.....7890',
        data: { network: tx.fromChain, txHash: tx.txHash },
      },
    );
  });

  it('does not send a notification when completed update fails', async () => {
    const tx = createTx();
    repo.findPendingByProvider.mockResolvedValue({ ok: true, data: [tx] });
    mockGetTransferStatus.mockResolvedValue({
      receive: { txId: '0xreceive' },
    });
    repo.updateStatus.mockResolvedValue({
      ok: false,
      error: 'update failed',
    });

    await service.poll();

    expect(repo.updateStatus).toHaveBeenCalledWith(
      tx.txHash,
      SwapOrderStatus.COMPLETED,
      null,
    );
    expect(firebaseNotificationService.sendNotification).not.toHaveBeenCalled();
  });
});
