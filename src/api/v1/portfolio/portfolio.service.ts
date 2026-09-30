import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '../on-off-ramp/alchemy/http.service';
import { GetPortfolioData } from './dto/getPortfolioData';
import { PortfolioRepository } from './portfolio.repository';
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
