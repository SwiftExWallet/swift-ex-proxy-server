import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ChainEnum } from '../common/enums/chain.enum';
import { TransactionHistoryController } from './transaction-history.controller';

describe('TransactionHistoryController', () => {
  const transactionHistoryService = {
    getWalletTransactionHistory: jest.fn(),
  };
  const walletAddress = '0x1111111111111111111111111111111111111111';

  let controller: TransactionHistoryController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TransactionHistoryController(
      transactionHistoryService as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates to the service using the verified wallet address', async () => {
    const req = { wallet: { addresses: new Map([['multi', walletAddress]]) } };
    transactionHistoryService.getWalletTransactionHistory.mockResolvedValue({
      data: [],
      pagination: {},
    });

    const result = await controller.getHistory(req, {
      walletAddress,
      chain: ChainEnum.ETH,
      sentPageKey: 'a',
      receivedPageKey: 'b',
    });

    expect(
      transactionHistoryService.getWalletTransactionHistory,
    ).toHaveBeenCalledWith({
      walletAddress,
      chain: ChainEnum.ETH,
      sentPageKey: 'a',
      receivedPageKey: 'b',
    });
    expect(result).toEqual({ data: [], pagination: {} });
  });

  it('throws when no verified wallet is present on the request', async () => {
    const req = { wallet: null };

    await expect(
      controller.getHistory(req, { walletAddress, chain: ChainEnum.ETH }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(
      transactionHistoryService.getWalletTransactionHistory,
    ).not.toHaveBeenCalled();
  });

  it('rejects when the requested wallet does not match the verified wallet', async () => {
    const otherAddress = '0x2222222222222222222222222222222222222222';
    const req = { wallet: { addresses: new Map([['multi', otherAddress]]) } };

    await expect(
      controller.getHistory(req, { walletAddress, chain: ChainEnum.ETH }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      transactionHistoryService.getWalletTransactionHistory,
    ).not.toHaveBeenCalled();
  });
});
