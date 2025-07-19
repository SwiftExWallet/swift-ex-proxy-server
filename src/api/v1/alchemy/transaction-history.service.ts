import { Injectable } from '@nestjs/common';
import {
  Alchemy,
  AssetTransfersCategory,
  Network,
  SortingOrder,
} from 'alchemy-sdk';
import { ChainEnum } from '../common/enums/chain.enum';

@Injectable()
export class TransactionHistoryService {
  ethAlchemy: Alchemy;
  bscAlchemy: Alchemy;
  constructor() {
    const ethNetworkKey = process.env
      .ALCHEMY_ETH_NETWORK as keyof typeof Network;

    const bscNetworkKey = process.env
      .ALCHEMY_BSC_NETWORK as keyof typeof Network;

    if (
      !ethNetworkKey ||
      !(ethNetworkKey in Network) ||
      !bscNetworkKey ||
      !(bscNetworkKey in Network)
    ) {
      throw new Error(
        `Invalid ALCHEMY_ETH_NETWORK value: ${process.env.ALCHEMY_ETH_NETWORK}`,
      );
    }
    this.ethAlchemy = new Alchemy({
      apiKey: process.env.ALCHEMY_API_KEY,
      network: Network[ethNetworkKey],
    });

    this.ethAlchemy = new Alchemy({
      apiKey: process.env.ALCHEMY_API_KEY,
      network: Network[bscNetworkKey],
    });
  }
  getCategories(): AssetTransfersCategory[] {
    const raw = process.env.ALCHEMY_ASSET_TRANSFER_CATEGORIES ?? '';
    const validCategories = Object.values(AssetTransfersCategory);

    return raw
      .split(',')
      .map((c) => c.trim())
      .filter((c): c is AssetTransfersCategory =>
        validCategories.includes(c as AssetTransfersCategory),
      );
  }
  async getWalletTransactionHistory(walletAddress: string, chain: ChainEnum) {
    const alchemy: Alchemy =
      chain == ChainEnum.ETH ? this.ethAlchemy : this.bscAlchemy;
    const category: AssetTransfersCategory[] = this.getCategories();

    const [sentTx, receivedTx] = await Promise.all([
      alchemy.core.getAssetTransfers({
        fromAddress: walletAddress,
        category,
        order: SortingOrder.DESCENDING,
        maxCount: Number(process.env.ALCHEMY_HISTORY_RECORD_COUNT) || 300,
      }),
      alchemy.core.getAssetTransfers({
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
