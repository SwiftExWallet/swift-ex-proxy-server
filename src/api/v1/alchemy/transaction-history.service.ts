import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Alchemy,
  AssetTransfersCategory,
  Network,
  SortingOrder,
} from 'alchemy-sdk';
import { ChainEnum, TxChainEnum } from '../common/enums/chain.enum';
import { TransactionHistoryDto } from './dto/transaction-history.dto';

@Injectable()
export class TransactionHistoryService {
  private readonly logger = new Logger(TransactionHistoryService.name);
  private readonly clientAlchemy: Partial<Record<ChainEnum, Alchemy>>;

  constructor() {
    const networkMap: Partial<Record<ChainEnum, keyof typeof Network>> = {
      [ChainEnum.ETH]: process.env.ALCHEMY_ETH_NETWORK as keyof typeof Network,
      [ChainEnum.BSC]: process.env.ALCHEMY_BSC_NETWORK as keyof typeof Network,
      [ChainEnum.POL]: process.env.ALCHEMY_POL_NETWORK as keyof typeof Network,
      [ChainEnum.ARB]: process.env.ALCHEMY_ARB_NETWORK as keyof typeof Network,
      [ChainEnum.BASE]: process.env.ALCHEMY_BAS_NETWORK as keyof typeof Network,
      [ChainEnum.AVAX]: process.env.ALCHEMY_AVA_NETWORK as keyof typeof Network,
      [ChainEnum.OP]: process.env.ALCHEMY_OPT_NETWORK as keyof typeof Network,
    };
    this.clientAlchemy = {};

    for (const [chain, networkKey] of Object.entries(networkMap)) {
      if (!networkKey || !(networkKey in Network)) {
        this.logger.warn(`unable to porvide ${chain}`);
        continue;
      }

      this.clientAlchemy[chain as ChainEnum] = new Alchemy({
        apiKey: process.env.ALCHEMY_API_KEY,
        network: Network[networkKey],
      });
    }
  }

  private getAlchemyClient(chain: ChainEnum): Alchemy {
    const alchemyClient = this.clientAlchemy[chain];
    if (!alchemyClient) {
      throw new BadRequestException(`Unable to porvide ${chain} wallet transaction history.`);
    }
    return alchemyClient;
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
      const fractionStr = fraction
        .toString()
        .padStart(decimals, '0')
        .slice(0, 6);
      return `${whole}.${fractionStr}`;
    } catch {
      return '0';
    }
  }

  async getWalletTransactionHistory(walletAddressDto: TransactionHistoryDto) {
    const { walletAddress, sentPageKey, receivedPageKey, chain } = walletAddressDto;
    const alchemy = this.getAlchemyClient(chain);
    const categories = this.getTransferCategories();
    const [sent, received] = await Promise.all([
      alchemy.core.getAssetTransfers({
        fromAddress: walletAddress,
        category: categories,
        order: SortingOrder.DESCENDING,
        maxCount: 10,
        pageKey: sentPageKey ?? undefined,
        withMetadata:true
      }),
      alchemy.core.getAssetTransfers({
        toAddress: walletAddress,
        category: categories,
        order: SortingOrder.DESCENDING,
        maxCount: 10,
        pageKey: receivedPageKey ?? undefined,
        withMetadata:true
      }),
    ]);

    const combined = [...(sent.transfers || []), ...(received.transfers || [])]
      .filter((tx, i, arr) => arr.findIndex((t) => t.hash === tx.hash) === i)
      .sort((a, b) => {
        const aBlock = parseInt(a.blockNum || '0x0', 16);
        const bBlock = parseInt(b.blockNum || '0x0', 16);
        return bBlock - aBlock;
      });

    const tokenContracts = new Set<string>();
    for (const tx of combined) {
      if (tx.category === 'erc20' && tx.rawContract?.address) {
        tokenContracts.add(tx.rawContract.address.toLowerCase());
      }
    }

    const metadataMap: Record<string, { symbol: string; decimals: number }> = {};
    await Promise.all(
      Array.from(tokenContracts).map(async (address) => {
        metadataMap[address] = await this.getTokenMetadata(alchemy, address);
      }),
    );

    for (const tx of combined) {
      if (tx.category === 'erc20' && tx.rawContract?.address) {
        const addr = tx.rawContract.address.toLowerCase();
        const meta = metadataMap[addr];
        const decimals = Number(tx.rawContract.decimal || meta?.decimals || 18);
        tx.asset = tx.asset || meta?.symbol || 'UNKNOWN';
        tx.rawContract.decimal = decimals.toString();
        (tx as any).formattedAmount = this.formatTokenAmount(
          tx.rawContract.value || '0',
          decimals,
        );
      } else if (tx.category === 'external') {
        tx.asset = chain === ChainEnum.BSC ? TxChainEnum.BSC : TxChainEnum.ETH;
        tx.rawContract.decimal = '18';
        (tx as any).formattedAmount = this.formatTokenAmount(
          tx.rawContract?.value || '0',
          18,
        );
      }
    }

    return {
      data: combined,
      pagination: {
        nextSentPageKey: sent.pageKey ?? null,
        nextReceivedPageKey: received.pageKey ?? null,
        hasSentNextPage: !!sent.pageKey,
        hasReceivedNextPage: !!received.pageKey,
        hasNextPage: !!(sent.pageKey || received.pageKey),
      },
    };
  }
}
