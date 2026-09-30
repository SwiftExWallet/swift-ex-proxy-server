import { BadRequestException, Logger } from '@nestjs/common';
import { ChainEnum } from '../common/enums/chain.enum';
import { TransactionHistoryService } from './transaction-history.service';

const mockGetAssetTransfers = jest.fn();
const mockGetTokenMetadata = jest.fn();

jest.mock('alchemy-sdk', () => ({
  Alchemy: jest.fn().mockImplementation(() => ({
    core: {
      getAssetTransfers: (...args: unknown[]) => mockGetAssetTransfers(...args),
      getTokenMetadata: (...args: unknown[]) => mockGetTokenMetadata(...args),
    },
  })),
  Network: {
    ETH_MAINNET: 'eth-mainnet',
    BNB_MAINNET: 'bnb-mainnet',
  },
  AssetTransfersCategory: {
    EXTERNAL: 'external',
    INTERNAL: 'internal',
    ERC20: 'erc20',
    ERC721: 'erc721',
    ERC1155: 'erc1155',
  },
  SortingOrder: {
    DESCENDING: 'desc',
  },
}));

describe('TransactionHistoryService', () => {
  const originalEnv = process.env;
  const walletAddress = '0x1111111111111111111111111111111111111111';

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ALCHEMY_API_KEY;
    delete process.env.ALCHEMY_ETH_NETWORK;
    delete process.env.ALCHEMY_BSC_NETWORK;
    process.env.ALCHEMY_ASSET_TRANSFER_CATEGORIES =
      'external,internal,erc20,erc721,erc1155';

    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    mockGetAssetTransfers.mockReset();
    mockGetTokenMetadata.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('throws when the chain has no configured Alchemy client', async () => {
    const service = new TransactionHistoryService();

    await expect(
      service.getWalletTransactionHistory({
        walletAddress,
        chain: ChainEnum.ETH,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('drops the internal category for bsc but keeps it for eth', async () => {
    process.env.ALCHEMY_API_KEY = 'test-key';
    process.env.ALCHEMY_ETH_NETWORK = 'ETH_MAINNET';
    process.env.ALCHEMY_BSC_NETWORK = 'BNB_MAINNET';
    const service = new TransactionHistoryService();
    mockGetAssetTransfers.mockResolvedValue({
      transfers: [],
      pageKey: undefined,
    });

    await service.getWalletTransactionHistory({
      walletAddress,
      chain: ChainEnum.BSC,
    });
    for (const call of mockGetAssetTransfers.mock.calls) {
      expect(call[0].category).not.toContain('internal');
    }

    mockGetAssetTransfers.mockClear();

    await service.getWalletTransactionHistory({
      walletAddress,
      chain: ChainEnum.ETH,
    });
    for (const call of mockGetAssetTransfers.mock.calls) {
      expect(call[0].category).toContain('internal');
    }
  });

  it('merges, dedupes and sorts sent/received transfers, enriching erc20 + external legs', async () => {
    process.env.ALCHEMY_API_KEY = 'test-key';
    process.env.ALCHEMY_ETH_NETWORK = 'ETH_MAINNET';
    const service = new TransactionHistoryService();

    mockGetAssetTransfers
      .mockResolvedValueOnce({
        transfers: [
          {
            hash: '0xshared',
            category: 'erc20',
            blockNum: '0x2',
            rawContract: { address: '0xTOKEN', value: '1000000' },
          },
          {
            hash: '0xexternal',
            category: 'external',
            blockNum: '0x1',
            rawContract: { value: '2000000000000000000' },
          },
        ],
        pageKey: 'next-sent',
      })
      .mockResolvedValueOnce({
        // duplicate hash across sent/received must be deduped
        transfers: [
          {
            hash: '0xshared',
            category: 'erc20',
            blockNum: '0x2',
            rawContract: { address: '0xTOKEN', value: '1000000' },
          },
        ],
        pageKey: undefined,
      });

    mockGetTokenMetadata.mockResolvedValue({ symbol: 'USDT', decimals: 6 });

    const result = await service.getWalletTransactionHistory({
      walletAddress,
      chain: ChainEnum.ETH,
    });

    expect(result.data).toHaveLength(2);
    // sorted descending by block number
    expect(result.data[0].hash).toBe('0xshared');
    expect(result.data[1].hash).toBe('0xexternal');

    const erc20Tx = result.data.find((t: any) => t.hash === '0xshared') as any;
    expect(erc20Tx.asset).toBe('USDT');
    expect(erc20Tx.formattedAmount).toBe('1.000000');

    const externalTx = result.data.find(
      (t: any) => t.hash === '0xexternal',
    ) as any;
    expect(externalTx.asset).toBe('ETH');
    expect(externalTx.formattedAmount).toBe('2.000000');

    expect(result.pagination).toEqual({
      nextSentPageKey: 'next-sent',
      nextReceivedPageKey: null,
      hasSentNextPage: true,
      hasReceivedNextPage: false,
      hasNextPage: true,
    });
  });
});
