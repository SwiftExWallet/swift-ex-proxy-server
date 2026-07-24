import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TransactionHistoryService } from './transaction-history.service';
import { ChainEnum } from '../common/enums/chain.enum';

const mockGetAssetTransfers = jest.fn();
const mockGetTokenMetadata = jest.fn();

const mockAlchemyCore = {
  getAssetTransfers: mockGetAssetTransfers,
  getTokenMetadata: mockGetTokenMetadata,
};

jest.mock('alchemy-sdk', () => ({
  Alchemy: jest.fn().mockImplementation(() => ({ core: mockAlchemyCore })),
  Network: { ETH_MAINNET: 'eth-mainnet', ARB_MAINNET: 'arb-mainnet' },
  AssetTransfersCategory: {
    EXTERNAL: 'external',
    INTERNAL: 'internal',
    ERC20: 'erc20',
    ERC721: 'erc721',
    ERC1155: 'erc1155',
    SPECIALNFT: 'specialnft',
  },
  SortingOrder: { DESCENDING: 'desc' },
}));

describe('TransactionHistoryService', () => {
  let service: TransactionHistoryService;

  beforeEach(async () => {
    process.env.ALCHEMY_ETH_NETWORK = 'ETH_MAINNET';
    process.env.ALCHEMY_API_KEY = 'test-key';
    process.env.ALCHEMY_ASSET_TRANSFER_CATEGORIES = 'external,erc20';
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionHistoryService],
    }).compile();

    service = module.get<TransactionHistoryService>(TransactionHistoryService);
  });

  afterEach(() => {
    delete process.env.ALCHEMY_ETH_NETWORK;
    delete process.env.ALCHEMY_API_KEY;
    delete process.env.ALCHEMY_ASSET_TRANSFER_CATEGORIES;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws BadRequestException for unconfigured chain', async () => {
    await expect(
      service.getWalletTransactionHistory({
        walletAddress: '0xabc',
        chain: ChainEnum.BSC,
        sentPageKey: undefined,
        receivedPageKey: undefined,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  describe('getWalletTransactionHistory', () => {
    const walletAddress = '0xWallet';

    beforeEach(() => {
      mockGetTokenMetadata.mockResolvedValue({ symbol: 'USDC', decimals: 6 });
    });

    it('combines sent and received transfers', async () => {
      const sentTx = {
        hash: '0xsent',
        blockNum: '0x64',
        category: 'external',
        rawContract: {
          value: '1000000000000000000',
          address: null,
          decimal: '18',
        },
      };
      const receivedTx = {
        hash: '0xreceived',
        blockNum: '0x63',
        category: 'external',
        rawContract: {
          value: '500000000000000000',
          address: null,
          decimal: '18',
        },
      };

      mockGetAssetTransfers
        .mockResolvedValueOnce({ transfers: [sentTx], pageKey: null })
        .mockResolvedValueOnce({ transfers: [receivedTx], pageKey: null });

      const result = await service.getWalletTransactionHistory({
        walletAddress,
        chain: ChainEnum.ETH,
        sentPageKey: undefined,
        receivedPageKey: undefined,
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.map((t) => t.hash)).toContain('0xsent');
      expect(result.data.map((t) => t.hash)).toContain('0xreceived');
    });

    it('deduplicates transfers with the same hash', async () => {
      const tx = {
        hash: '0xdup',
        blockNum: '0x64',
        category: 'external',
        rawContract: { value: '0', address: null, decimal: '18' },
      };
      mockGetAssetTransfers
        .mockResolvedValueOnce({ transfers: [tx], pageKey: null })
        .mockResolvedValueOnce({ transfers: [tx], pageKey: null });

      const result = await service.getWalletTransactionHistory({
        walletAddress,
        chain: ChainEnum.ETH,
        sentPageKey: undefined,
        receivedPageKey: undefined,
      });

      expect(result.data).toHaveLength(1);
    });

    it('sorts results by block number descending', async () => {
      const tx1 = {
        hash: '0xA',
        blockNum: '0x63',
        category: 'external',
        rawContract: { value: '0', address: null, decimal: '18' },
      };
      const tx2 = {
        hash: '0xB',
        blockNum: '0x65',
        category: 'external',
        rawContract: { value: '0', address: null, decimal: '18' },
      };

      mockGetAssetTransfers
        .mockResolvedValueOnce({ transfers: [tx1], pageKey: null })
        .mockResolvedValueOnce({ transfers: [tx2], pageKey: null });

      const result = await service.getWalletTransactionHistory({
        walletAddress,
        chain: ChainEnum.ETH,
        sentPageKey: undefined,
        receivedPageKey: undefined,
      });

      expect(result.data[0].hash).toBe('0xB');
      expect(result.data[1].hash).toBe('0xA');
    });

    it('fetches token metadata for erc20 transfers', async () => {
      const erc20Tx = {
        hash: '0xerc',
        blockNum: '0x64',
        category: 'erc20',
        rawContract: {
          value: '1000000',
          address: '0xTokenAddr',
          decimal: null,
        },
        asset: null,
      };

      mockGetAssetTransfers
        .mockResolvedValueOnce({ transfers: [erc20Tx], pageKey: null })
        .mockResolvedValueOnce({ transfers: [], pageKey: null });

      const result = await service.getWalletTransactionHistory({
        walletAddress,
        chain: ChainEnum.ETH,
        sentPageKey: undefined,
        receivedPageKey: undefined,
      });

      expect(mockGetTokenMetadata).toHaveBeenCalledWith('0xtokenaddr');
      expect(result.data[0].asset).toBe('USDC');
    });

    it('falls back to UNKNOWN when metadata fetch fails', async () => {
      mockGetTokenMetadata.mockRejectedValue(new Error('fetch failed'));
      const erc20Tx = {
        hash: '0xerr',
        blockNum: '0x64',
        category: 'erc20',
        rawContract: { value: '0', address: '0xBadAddr', decimal: null },
        asset: null,
      };

      mockGetAssetTransfers
        .mockResolvedValueOnce({ transfers: [erc20Tx], pageKey: null })
        .mockResolvedValueOnce({ transfers: [], pageKey: null });

      const result = await service.getWalletTransactionHistory({
        walletAddress,
        chain: ChainEnum.ETH,
        sentPageKey: undefined,
        receivedPageKey: undefined,
      });

      expect(result.data[0].asset).toBe('UNKNOWN');
    });

    it('returns pagination keys', async () => {
      mockGetAssetTransfers
        .mockResolvedValueOnce({ transfers: [], pageKey: 'sent-next' })
        .mockResolvedValueOnce({ transfers: [], pageKey: null });

      const result = await service.getWalletTransactionHistory({
        walletAddress,
        chain: ChainEnum.ETH,
        sentPageKey: undefined,
        receivedPageKey: undefined,
      });

      expect(result.pagination.nextSentPageKey).toBe('sent-next');
      expect(result.pagination.hasSentNextPage).toBe(true);
      expect(result.pagination.hasNextPage).toBe(true);
    });
  });
});
