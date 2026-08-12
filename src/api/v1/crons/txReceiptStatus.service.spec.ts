import { Logger } from '@nestjs/common';
import { Alchemy } from 'alchemy-sdk';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { TxReceiptStatusService } from './txReceiptStatus.service';

const mockGetTransactionReceipt = jest.fn();

jest.mock('alchemy-sdk', () => ({
  Alchemy: jest.fn().mockImplementation(() => ({
    core: {
      getTransactionReceipt: (...args: unknown[]) =>
        mockGetTransactionReceipt(...args),
    },
  })),
  Network: {
    ETH_MAINNET: 'eth-mainnet',
  },
}));

describe('TxReceiptStatusService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const mockAlchemyConstructor = Alchemy as unknown as jest.Mock;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BLOCKSCOUT_ETH;
    delete process.env.BLOCKSCOUT_BSC;
    delete process.env.BLOCKSCOUT_POL;
    delete process.env.BLOCKSCOUT_ARB;
    delete process.env.BLOCKSCOUT_OPT;
    delete process.env.BLOCKSCOUT_BAS;
    delete process.env.BLOCKSCOUT_AVA;
    delete process.env.BLOCKSCOUT_ALLOWED_HOSTS;
    delete process.env.ALCHEMY_API_KEY;
    delete process.env.ALCHEMY_API_KEY_1;
    delete process.env.ALCHEMY_API_KEY_2;
    delete process.env.ALCHEMY_API_KEY_3;
    delete process.env.ALCHEMY_API_KEY_4;
    delete process.env.ALCHEMY_ETH_NETWORK;

    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(new AbortController().signal);
    mockGetTransactionReceipt.mockReset();
    mockAlchemyConstructor.mockClear();
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    (global as any).fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('rejects unallowlisted Blockscout URLs during construction', () => {
    process.env.BLOCKSCOUT_ALLOWED_HOSTS = 'blockscout.eth';
    process.env.BLOCKSCOUT_ETH = 'https://evil.example';

    expect(() => new TxReceiptStatusService()).toThrow(
      'BLOCKSCOUT_ETH host is not allowlisted',
    );
  });

  it('maps successful Blockscout receipts to completed', async () => {
    process.env.BLOCKSCOUT_ALLOWED_HOSTS = 'blockscout.eth';
    process.env.BLOCKSCOUT_ETH = 'https://blockscout.eth';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: '1',
        message: 'OK',
        result: { status: '1' },
      }),
    });

    const status = await new TxReceiptStatusService().getStatus(
      'ETH',
      '0xhash',
    );

    expect(status).toBe(SwapOrderStatus.COMPLETED);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://blockscout.eth/api?module=transaction&action=gettxreceiptstatus&txhash=0xhash',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(Object),
      }),
    );
  });

  it('maps failed Blockscout receipts to failed', async () => {
    process.env.BLOCKSCOUT_ALLOWED_HOSTS = 'blockscout.eth';
    process.env.BLOCKSCOUT_ETH = 'https://blockscout.eth';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: '1',
        message: 'OK',
        result: { status: '0' },
      }),
    });

    const status = await new TxReceiptStatusService().getStatus(
      'ETH',
      '0xhash',
    );

    expect(status).toBe(SwapOrderStatus.FAILED);
  });

  it('falls back to Alchemy when Blockscout is not configured', async () => {
    process.env.ALCHEMY_API_KEY = 'alchemy-key';
    process.env.ALCHEMY_ETH_NETWORK = 'ETH_MAINNET';
    mockGetTransactionReceipt.mockResolvedValue({ status: 1 });

    const status = await new TxReceiptStatusService().getStatus(
      'ETH',
      '0xhash',
    );

    expect(status).toBe(SwapOrderStatus.COMPLETED);
    expect(mockAlchemyConstructor).toHaveBeenCalledWith({
      apiKey: 'alchemy-key',
      network: 'eth-mainnet',
    });
    expect(mockGetTransactionReceipt).toHaveBeenCalledWith('0xhash');
  });
});
