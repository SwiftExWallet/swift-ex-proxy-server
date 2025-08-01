import { Injectable } from '@nestjs/common';
import {
  Alchemy,
  AssetTransfersCategory,
  Network,
  SortingOrder,
} from 'alchemy-sdk';
import { ChainEnum, TxChainEnum } from '../common/enums/chain.enum';
import { WalletAddressDto } from '../common/dto/walletAddress.dto';

@Injectable()
export class TransactionHistoryService {
  private readonly ethAlchemy: Alchemy;
  private readonly bscAlchemy: Alchemy;

  constructor() {
    const ethNetworkKey = process.env.ALCHEMY_ETH_NETWORK as keyof typeof Network;
    const bscNetworkKey = process.env.ALCHEMY_BSC_NETWORK as keyof typeof Network;

    if (!ethNetworkKey || !bscNetworkKey || !(ethNetworkKey in Network) || !(bscNetworkKey in Network)) {
      throw new Error(
        `Invalid ALCHEMY_ETH_NETWORK value: ${process.env.ALCHEMY_ETH_NETWORK}`,
      );
    }
    this.ethAlchemy = new Alchemy({
      apiKey: process.env.ALCHEMY_API_KEY,
      network: Network[ethNetworkKey],
    });

    this.bscAlchemy = new Alchemy({
      apiKey: process.env.ALCHEMY_API_KEY,
      network: Network[bscNetworkKey],
    });
  }

  private getAlchemyClient(chain: ChainEnum): Alchemy {
    return chain === ChainEnum.ETH ? this.ethAlchemy : this.bscAlchemy;
  }

  private getTransferCategories(): AssetTransfersCategory[] {
    const raw = process.env.ALCHEMY_ASSET_TRANSFER_CATEGORIES ?? '';
    const validCategories = Object.values(AssetTransfersCategory);

    return raw
      .split(',')
      .map((c) => c.trim())
      .filter((c): c is AssetTransfersCategory =>
        validCategories.includes(c as AssetTransfersCategory),
      );
  }

  private async getTokenMetadata(alchemy: Alchemy, address: string) {
    try {
      const metadata = await alchemy.core.getTokenMetadata(address);
      return {
        symbol: metadata?.symbol || 'UNKNOWN',
        decimals: metadata?.decimals ?? 18,
      };
    } catch (error) {
      console.error(`Metadata fetch failed for ${address}:`, error);
      return {
        symbol: 'UNKNOWN',
        decimals: 18,
      };
    }
  }

  private formatTokenAmount(rawValue: string, decimals: number): string {
    try {
      const raw = BigInt(rawValue || '0');
      const divisor = BigInt(10) ** BigInt(decimals);
      const whole = raw / divisor;
      const fraction = raw % divisor;
      const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 6);
      return `${whole}.${fractionStr}`;
    } catch {
      return '0';
    }
  }

  async getWalletTransactionHistory(
    walletAddressDto: WalletAddressDto,
    chain: ChainEnum,
  ) {
    const { walletAddress } = walletAddressDto;
    const alchemy = this.getAlchemyClient(chain);
    const categories = this.getTransferCategories();
    const maxCount = Number(process.env.ALCHEMY_HISTORY_RECORD_COUNT || '100');

    const [sent, received] = await Promise.all([
      alchemy.core.getAssetTransfers({
        fromAddress: walletAddress,
        category: categories,
        order: SortingOrder.DESCENDING,
        maxCount,
      }),
      alchemy.core.getAssetTransfers({
        toAddress: walletAddress,
        category: categories,
        order: SortingOrder.DESCENDING,
        maxCount,
      }),
    ]);

    const combined = [...(sent.transfers || []), ...(received.transfers || [])]
      .filter((tx, i, arr) => arr.findIndex(t => t.hash === tx.hash) === i)
      .sort((a, b) => {
        const aBlock = parseInt(a.blockNum || '0x0', 16);
        const bBlock = parseInt(b.blockNum || '0x0', 16);
        return bBlock - aBlock;
      });

    // STEP 1: Collect unique ERC-20 contract addresses
    const tokenContracts = new Set<string>();
    for (const tx of combined) {
      if (tx.category === 'erc20' && tx.rawContract?.address) {
        tokenContracts.add(tx.rawContract.address.toLowerCase());
      }
    }

    // STEP 2: Fetch metadata for each contract in parallel
    const metadataMap: Record<string, { symbol: string; decimals: number }> = {};
    await Promise.all(
      Array.from(tokenContracts).map(async (address) => {
        metadataMap[address] = await this.getTokenMetadata(alchemy, address);
      }),
    );

    // STEP 3: Patch each transfer with metadata + formatted value
    for (const tx of combined) {
      if (tx.category === 'erc20' && tx.rawContract?.address) {
        const addr = tx.rawContract.address.toLowerCase();
        const meta = metadataMap[addr];
    
        const decimals = Number(tx.rawContract.decimal || meta?.decimals || 18);
        tx.asset = tx.asset || meta?.symbol || 'UNKNOWN';
        tx.rawContract.decimal = decimals.toString();
        (tx as any).formattedAmount = this.formatTokenAmount(tx.rawContract.value || '0', decimals);
      } else if (tx.category === 'external') {
        // Native chain token transfer
        tx.asset = chain === ChainEnum.BSC ? TxChainEnum.BSC : TxChainEnum.ETH;
        tx.rawContract.decimal = '18';
        (tx as any).formattedAmount = this.formatTokenAmount(tx.rawContract?.value || '0', 18);
      }
    }
    

    return combined;
  }
}
