import { Injectable } from '@nestjs/common';
import { PortfolioToken } from './schema/portfolio.schema';
import { AlchemyPortfolioResponse } from './interfaces/portfolio-sync.interface';

interface NativeTokenMeta {
  symbol: string;
  name: string;
  decimals: number;
}

@Injectable()
export class PortfolioMapper {
  private static readonly NATIVE_TOKEN_META: Record<string, NativeTokenMeta> = {
    'eth-mainnet': { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
    'bnb-mainnet': { symbol: 'BNB', name: 'BNB', decimals: 18 },
    'matic-mainnet': { symbol: 'POL', name: 'Polygon', decimals: 18 },
    'arb-mainnet': { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
    'base-mainnet': { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
    'opt-mainnet': { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
    'avax-mainnet': { symbol: 'AVAX', name: 'Avalanche', decimals: 18 },
  };

  private static readonly SWAP_NETWORK_TO_ALCHEMY: Record<string, string> = {
    ETH: 'eth-mainnet',
    BSC: 'bnb-mainnet',
    BNB: 'bnb-mainnet',
    POL: 'matic-mainnet',
    MATIC: 'matic-mainnet',
    ARB: 'arb-mainnet',
    BASE: 'base-mainnet',
    AVAX: 'avax-mainnet',
    OPT: 'opt-mainnet',
    OP: 'opt-mainnet',
  };

  resolveAlchemyNetwork(chain: string): string | undefined {
    return PortfolioMapper.SWAP_NETWORK_TO_ALCHEMY[chain?.toUpperCase()];
  }

  hexToDecimalString(hex: string, decimals: number): string {
    const raw = BigInt(hex);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;

    if (fraction === 0n) {
      return whole.toString();
    }

    const fractionStr = fraction
      .toString()
      .padStart(decimals, '0')
      .replace(/0+$/, '');

    return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
  }

  normalize(response: AlchemyPortfolioResponse): {
    tokens: PortfolioToken[];
    totalValueUsd: string;
  } {
    const tokens: PortfolioToken[] = [];
    let totalValueUsd = 0;

    for (const entry of response.data.tokens) {
      if (BigInt(entry.tokenBalance) === 0n) {
        continue;
      }

      const nativeMeta =
        entry.tokenAddress === null
          ? PortfolioMapper.NATIVE_TOKEN_META[entry.network]
          : undefined;

      const decimals =
        entry.tokenMetadata.decimals ?? nativeMeta?.decimals ?? null;
      const symbol = entry.tokenMetadata.symbol ?? nativeMeta?.symbol ?? null;
      const name = entry.tokenMetadata.name ?? nativeMeta?.name ?? null;
      const logo = entry.tokenMetadata.logo ?? null;

      const priceUsd =
        entry.tokenPrices.find((p) => p.currency === 'usd')?.value ?? null;
      const balance =
        decimals !== null
          ? this.hexToDecimalString(entry.tokenBalance, decimals)
          : null;
      const valueUsd =
        balance && priceUsd
          ? (Number(balance) * Number(priceUsd)).toString()
          : null;

      if (valueUsd) {
        totalValueUsd += Number(valueUsd);
      }

      tokens.push({
        network: entry.network,
        tokenAddress: entry.tokenAddress,
        symbol,
        name,
        decimals,
        logo,
        balanceHex: entry.tokenBalance,
        balance,
        priceUsd,
        valueUsd,
      } as PortfolioToken);
    }

    return { tokens, totalValueUsd: totalValueUsd.toString() };
  }
}
