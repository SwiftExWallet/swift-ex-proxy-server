import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioMapper } from './portfolio.mapper';
import { Portfolio, PortfolioToken } from './schema/portfolio.schema';
import { AlchemyPortfolioResponse } from './interfaces/portfolio-sync.interface';

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
  private readonly url = `https://api.g.alchemy.com/data/v1/${process.env.ALCHEMY_PORTFOLIO_KEY}/assets/tokens/by-address`;
  private readonly networks = this.getNetworks();

  constructor(
    private readonly repository: PortfolioRepository,
    private readonly mapper: PortfolioMapper,
  ) {}

  async getPortfolio(deviceId: string, address: string): Promise<Portfolio> {
    address = this.normalizeAddress(address);
    const existing = await this.repository.findByAddress(address);
    const isFresh = !!existing && existing.stale === false;

    if (isFresh) {
      return existing as Portfolio;
    }

    try {
      const response = await this.fetchFromAlchemy(address);
      const { tokens, totalValueUsd } = this.mapper.normalize(response);
      return (await this.repository.upsert(
        deviceId,
        address,
        tokens,
        totalValueUsd,
      )) as Portfolio;
    } catch (error) {
      this.logger.error('Failed to sync portfolio', { deviceId, address, error });

      if (existing) {
        await this.repository.markFailed(deviceId, address, (error as Error).message);
        return existing;
      }

      throw new BadGatewayException('Failed to fetch portfolio');
    }
  }

  async refreshPortfolio(deviceId: string, address: string, chains?: string[]): Promise<void> {
    address = this.normalizeAddress(address);
    try {
      const existing = chains?.length
        ? await this.repository.findByAddress(address)
        : null;

      if (chains?.length && existing) {
        await this.refreshNetworks(deviceId, address, chains, existing);
      } else {
        const response = await this.fetchFromAlchemy(address);
        const { tokens, totalValueUsd } = this.mapper.normalize(response);
        await this.repository.upsert(deviceId, address, tokens, totalValueUsd);
      }
    } catch (error) {
      this.logger.error('Failed to refresh portfolio', { deviceId, address, error });
      await this.repository.markFailed(deviceId, address, (error as Error).message);
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
      this.logger.debug(`No supported Alchemy network for chains=[${chains.join(',')}], skipping refresh`);
      return;
    }

    const response = await this.fetchFromAlchemy(address, networks);
    const { tokens: freshTokens } = this.mapper.normalize(response);

    const targetNetworks = new Set(networks);
    const preserved = existing.tokens.filter((t) => !targetNetworks.has(t.network));
    const merged = [...preserved, ...freshTokens];

    await this.repository.upsert(deviceId, address, merged, this.sumValueUsd(merged));
  }

  private resolveNetworks(chains: string[]): string[] {
    const networks = new Set<string>();
    for (const chain of chains) {
      const network = this.mapper.resolveAlchemyNetwork(chain);
      if (network) {
        networks.add(network);
      }
    }
    return [...networks];
  }

  private normalizeAddress(address: string): string {
    return address.toLowerCase();
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
    const response = await axios.post(this.url, {
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
    });

    return response.data as AlchemyPortfolioResponse;
  }
}
