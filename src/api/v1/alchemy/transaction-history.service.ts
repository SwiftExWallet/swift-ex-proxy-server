import { Injectable } from '@nestjs/common';
import {
  Alchemy,
  AssetTransfersCategory,
  Network,
  SortingOrder,
} from 'alchemy-sdk';

@Injectable()
export class TransactionHistoryService {
  alchemy: Alchemy;
  constructor() {
    this.alchemy = new Alchemy({
      apiKey: process.env.ALCHEMY_API_KEY,
      network: Network.ETH_SEPOLIA,
    });
  }
  async getWalletTransactionHistory(walletAddress: string) {
    const category: AssetTransfersCategory[] = [
      AssetTransfersCategory.EXTERNAL,
      AssetTransfersCategory.ERC20,
      AssetTransfersCategory.ERC1155,
      AssetTransfersCategory.ERC721,
    ];

    const [sentTx, receivedTx] = await Promise.all([
      this.alchemy.core.getAssetTransfers({
        fromAddress: walletAddress,
        category,
        order: SortingOrder.DESCENDING,
        maxCount: Number(process.env.ALCHEMY_HISTORY_RECORD_COUNT) || 300,
      }),
      this.alchemy.core.getAssetTransfers({
        toAddress: walletAddress,
        category,
        order: SortingOrder.DESCENDING,
        maxCount: Number(process.env.ALCHEMY_HISTORY_RECORD_COUNT) || 300,
      }),
    ]);

    const combinedTransfers = [
      ...(sentTx.transfers || []),
      ...(receivedTx.transfers || []),
    ].sort((a, b) => {
      const aBlock = a.blockNum ? parseInt(a.blockNum, 16) : 0;
      const bBlock = b.blockNum ? parseInt(b.blockNum, 16) : 0;
      return bBlock - aBlock; // descending
    });
    return combinedTransfers;
  }
}
