import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '../on-off-ramp/alchemy/http.service';
import { GetPortfolioData } from './dto/getPortfolioData';
import {
  DevicePortfolioResponse,
  PortfolioRepository,
  PortfolioTokenTotalsResponse,
} from './portfolio.repository';
import { PortfolioMapper } from './portfolio.mapper';
import { Portfolio, PortfolioToken } from './schema/portfolio.schema';
import {
  AlchemyPortfolioResponse,
  PortfolioResponse,
} from './interfaces/portfolio-sync.interface';
import { normalizeWalletAddress } from '../common/utils/address.util';

const DEFAULT_NETWORKS = [
  'eth-mainnet',
  'bnb-mainnet',
  'matic-mainnet',
  'arb-mainnet',
  'base-mainnet',
  'avax-mainnet',
  'opt-mainnet',
];

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);
  private readonly url: string;
  private readonly networks = this.getNetworks();
  private readonly SYNC_TTL_MS =
    Number(process.env.PORTFOLIO_SYNC_TTL_SECONDS ?? 35) * 1000;

  constructor(
    private readonly httpService: HttpService,
    private readonly portfolioRepository: PortfolioRepository,
    private readonly portfolioMapper: PortfolioMapper,
  ) {
    this.url = `https://api.g.alchemy.com/data/v1/${process.env.ALCHEMY_PORTFOLIO_KEY}/assets/tokens/by-address`;
  }

  async getPortfolio(
    deviceId: string,
    address: string,
    hardRefresh = false,
  ): Promise<PortfolioResponse> {
    address = this.normalizeAddress(address);

    const existing = await this.portfolioRepository.findByAddress(address);

    const canForceRefresh =
      hardRefresh &&
      !!existing?.lastSyncedAt &&
      Date.now() - existing.lastSyncedAt.getTime() >= this.SYNC_TTL_MS;

    const shouldFetch = !existing || existing.stale || canForceRefresh;

    if (!shouldFetch) {
      const existingDeviceId = String(existing.deviceId as unknown);
      if (existingDeviceId !== String(deviceId)) {
        await this.portfolioRepository.updateDevice(address, deviceId);
      }
      return this.portfolioMapper.toAlchemyResponse(existing);
    }

    try {
      const raw = await this.fetchFromAlchemy(address);
      const { tokens, totalValueUsd } = this.portfolioMapper.normalize(raw);
      const saved = await this.portfolioRepository.upsert(
        deviceId,
        address,
        tokens,
        totalValueUsd,
      );
      return this.portfolioMapper.toAlchemyResponse(saved as Portfolio);
    } catch (error) {
      this.logger.error('Failed to sync portfolio from Alchemy', {
        deviceId,
        address,
        error,
      });

      if (existing) {
        await this.portfolioRepository.markFailed(
          deviceId,
          address,
          (error as Error).message,
        );
        return this.portfolioMapper.toAlchemyResponse(existing);
      }
      throw new BadGatewayException('Failed to fetch portfolio');
    }
  }

  async getDevicePortfolioTotals(deviceId: string) {
    const deviceIdText = this.stringifyDeviceId(deviceId);
    const [totals, portfolios] = await Promise.all([
      this.portfolioRepository.aggregateTotalsByDevice(deviceId),
      this.portfolioRepository.findByDevice(deviceId),
    ]);

    const assets = totals.map((token) => this.toResponseAsset(token));
    const formattedPortfolios = portfolios.map((portfolio, index) => ({
      id: this.formatPortfolioId(index),
      address: portfolio.address,
      name: `Portfolio #${this.formatPortfolioId(index)}`,
      valueUsd: this.toNumber(portfolio.totalValueUsd),
      assets: portfolio.tokens.map((token) => this.toResponseAsset(token)),
    }));

    return {
      success: true,
      data: {
        device: {
          id: deviceIdText,
          maskedId: this.maskDeviceId(deviceIdText),
          isSynced: portfolios.every((p) => p.syncStatus === 'idle'),
          lastUpdated: this.getLastUpdated(portfolios),
        },
        summary: {
          totalValueUsd: formattedPortfolios.reduce(
            (sum, portfolio) => sum + portfolio.valueUsd,
            0,
          ),
          portfolioCount: portfolios.length,
          assetCount: assets.length,
          networkCount: new Set(assets.map((asset) => asset.network)).size,
        },
        networks: this.buildNetworkSummaries(assets),
        assets,
        portfolios: formattedPortfolios,
      },
    };
  }

  private toResponseAsset(
    token: PortfolioToken | PortfolioTokenTotalsResponse,
  ) {
    return {
      network: token.network,
      tokenAddress: token.tokenAddress,
      name: token.name,
      decimals: token.decimals,
      logo: token.logo,
      balance: token.balance,
      valueUsd: this.toNumber(token.valueUsd),
      priceUsd: token.priceUsd === null ? null : this.toNumber(token.priceUsd),
      symbol: token.symbol,
      balanceHex: token.balanceHex,
    };
  }

  private buildNetworkSummaries(
    assets: ReturnType<PortfolioService['toResponseAsset']>[],
  ) {
    const networks = new Map<
      string,
      { network: string; name: string; symbol: string; valueUsd: number; assetCount: number }
    >();

    for (const asset of assets) {
      const existing = networks.get(asset.network);
      if (existing) {
        existing.valueUsd += asset.valueUsd;
        existing.assetCount += 1;
        continue;
      }

      networks.set(asset.network, {
        network: asset.network,
        name: this.getNetworkName(asset.network),
        symbol: this.getNetworkSymbol(asset.network),
        valueUsd: asset.valueUsd,
        assetCount: 1,
      });
    }

    return [...networks.values()];
  }

  private formatPortfolioId(index: number): string {
    return (index + 1).toString().padStart(2, '0');
  }

  private maskDeviceId(deviceId: string): string {
    return `••••${deviceId.slice(-4)}`;
  }

  private stringifyDeviceId(deviceId: unknown): string {
    return String(deviceId);
  }

  private getLastUpdated(portfolios: DevicePortfolioResponse[]): string | null {
    const latest = portfolios
      .map((portfolio) => portfolio.updatedAt ?? portfolio.lastSyncedAt)
      .filter((date): date is Date => !!date)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return latest ? latest.toISOString() : null;
  }

  private toNumber(value: string | null): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private getNetworkName(network: string): string {
    const names: Record<string, string> = {
      'eth-mainnet': 'Ethereum',
      'ethereum-mainnet': 'Ethereum',
      'base-mainnet': 'Base',
      'matic-mainnet': 'Polygon',
      'polygon-mainnet': 'Polygon',
      'bnb-mainnet': 'BNB Smart Chain',
      'arb-mainnet': 'Arbitrum',
      'avax-mainnet': 'Avalanche',
      'opt-mainnet': 'Optimism',
    };

    return names[network] ?? network;
  }

  private getNetworkSymbol(network: string): string {
    const symbols: Record<string, string> = {
      'eth-mainnet': 'ETH',
      'ethereum-mainnet': 'ETH',
      'base-mainnet': 'ETH',
      'matic-mainnet': 'POL',
      'polygon-mainnet': 'POL',
      'bnb-mainnet': 'BNB',
      'arb-mainnet': 'ETH',
      'avax-mainnet': 'AVAX',
      'opt-mainnet': 'ETH',
    };

    return symbols[network] ?? '';
  }

  async refreshPortfolio(
    deviceId: string,
    address: string,
    chains?: string[],
  ): Promise<void> {
    address = this.normalizeAddress(address);
    try {
      const existing = chains?.length
        ? await this.portfolioRepository.findByAddress(address)
        : null;

      if (chains?.length && existing) {
        await this.refreshNetworks(deviceId, address, chains, existing);
      } else {
        const response = await this.fetchFromAlchemy(address);
        const { tokens, totalValueUsd } =
          this.portfolioMapper.normalize(response);
        await this.portfolioRepository.upsert(
          deviceId,
          address,
          tokens,
          totalValueUsd,
        );
      }
    } catch (error) {
      this.logger.error('Failed to refresh portfolio', {
        deviceId,
        address,
        error,
      });
      await this.portfolioRepository.markFailed(
        deviceId,
        address,
        (error as Error).message,
      );
    }
  }

  private async refreshNetworks(
    deviceId: string,
    address: string,
    chains: string[],
    existing: Portfolio,
  ): Promise<void> {
    const networks = this.resolveNetworks(chains);
    if (networks.length === 0) {
      this.logger.debug(
        `No supported Alchemy network for chains=[${chains.join(',')}], skipping refresh`,
      );
      return;
    }

    const response = await this.fetchFromAlchemy(address, networks);
    const { tokens: freshTokens } = this.portfolioMapper.normalize(response);

    const targetNetworks = new Set(networks);
    const preserved = existing.tokens.filter(
      (t) => !targetNetworks.has(t.network),
    );
    const merged = [...preserved, ...freshTokens];

    await this.portfolioRepository.upsert(
      deviceId,
      address,
      merged,
      this.sumValueUsd(merged),
    );
  }

  private resolveNetworks(chains: string[]): string[] {
    const networks = new Set<string>();
    for (const chain of chains) {
      const network = this.portfolioMapper.resolveAlchemyNetwork(chain);
      if (network) {
        networks.add(network);
      }
    }
    return [...networks];
  }

  private normalizeAddress(address: string): string {
    return normalizeWalletAddress(address);
  }

  private sumValueUsd(tokens: PortfolioToken[]): string {
    return tokens
      .reduce((sum, t) => sum + (t.valueUsd ? Number(t.valueUsd) : 0), 0)
      .toString();
  }

  private getNetworks(): string[] {
    const raw = process.env.ALCHEMY_PORTFOLIO_NETWORKS ?? '';
    const networks = raw
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    return networks.length > 0 ? networks : DEFAULT_NETWORKS;
  }

  private async fetchFromAlchemy(
    address: string,
    networks: string[] = this.networks,
  ): Promise<AlchemyPortfolioResponse> {
    const body: GetPortfolioData = {
      addresses: [
        {
          address,
          networks,
        },
      ],
      withMetadata: true,
      withPrices: true,
      includeNativeTokens: true,
      includeErc20Tokens: true,
    };
    const response = await this.httpService.post(this.url, body);
    return response.data as AlchemyPortfolioResponse;
  }
}
