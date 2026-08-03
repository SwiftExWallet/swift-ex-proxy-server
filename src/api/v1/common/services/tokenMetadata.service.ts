import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Contract, ZeroAddress } from 'ethers';
import { ETH_ERC20_ABI } from '../abi/eth';
import {
  ChainEnum,
  ChainId,
  SUPPORTED_QUOTE_CHAIN_IDS,
} from '../enums/chain.enum';
import { ProviderService } from '../../provider/provider.service';
import { RedisService } from '../../redis/redis.service';
import {
  ResolvedSwapQuoteDto,
  ResolvedTokenInfoDto,
  SwapQuoteDto,
  TokenInfoDto,
} from '../dto/swapQuote.dto';
import { withProviderControls } from '../utils/retry.util';

type TokenMetadata = {
  symbol: string;
  decimals: string;
};

interface TokenCatalogEntry {
  address: string;
  symbol: string;
  decimals: string | number;
}

const TOKEN_FILE_BY_CHAIN_ID: Record<number, string> = {
  1: 'eth',
  10: 'op',
  56: 'bsc',
  138: 'op',
  137: 'poly',
  42161: 'arb',
  43114: 'avax',
  8453: 'base',
  501: 'stellar',
};

const NATIVE_TOKEN_ADDRESSES = new Set([
  ZeroAddress.toLowerCase(),
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
]);

const NATIVE_TOKEN_SYMBOL_BY_CHAIN_ID: Partial<Record<ChainId, string>> = {
  [ChainId.ETH]: 'ETH',
  [ChainId.BSC]: 'BNB',
  [ChainId.POL]: 'POL',
  [ChainId.ARB]: 'ETH',
  [ChainId.OPT]: 'ETH',
  [ChainId.OP138]: 'OPT',
  [ChainId.AVA]: 'AVAX',
  [ChainId.BAS]: 'ETH',
  [ChainId.GNO]: 'XDAI',
  [ChainId.ZK]: 'ETH',
  [ChainId.LINEA]: 'ETH',
  [ChainId.SONIC]: 'S',
  [ChainId.UNI]: 'ETH',
};

@Injectable()
export class TokenMetadataService {
  private readonly logger = new Logger(TokenMetadataService.name);

  constructor(
    private readonly providerService: ProviderService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async normalizeSwapQuote(dto: SwapQuoteDto): Promise<ResolvedSwapQuoteDto> {
    const [tokenIn, tokenOut] = await Promise.all([
      this.resolveToken(dto.tokenIn),
      this.resolveToken(dto.tokenOut),
    ]);

    return {
      ...dto,
      tokenIn,
      tokenOut,
    };
  }

  async resolveToken(token: TokenInfoDto): Promise<ResolvedTokenInfoDto> {
    const metadata = await this.resolveMetadata(token);

    return {
      address: token.address,
      chainId: token.chainId,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
    };
  }

  private async resolveMetadata(token: TokenInfoDto): Promise<TokenMetadata> {
    const chainId = Number(token.chainId);
    if (!this.isSupportedQuoteChainId(chainId)) {
      throw new BadRequestException(
        `Unsupported token chainId: ${token.chainId}`,
      );
    }

    const catalogMetadata = await this.getCatalogMetadata(
      chainId,
      token.address,
    );

    if (catalogMetadata) {
      return catalogMetadata;
    }

    if (this.isNativeToken(token.address)) {
      return {
        symbol: this.getNativeTokenSymbol(chainId),
        decimals: '18',
      };
    }

    const cacheKey = `${chainId}:${token.address.toLowerCase()}`;
    const redisCached = await this.getRedisCachedMetadata(cacheKey);

    if (redisCached) {
      return redisCached;
    }

    try {
      const contract = new Contract(
        token.address,
        ETH_ERC20_ABI,
        this.providerService.getProviderForChainId(chainId),
      );
      const [symbol, decimalsRaw] = await Promise.all([
        withProviderControls('token-metadata:symbol', () => contract.symbol()),
        withProviderControls('token-metadata:decimals', () =>
          contract.decimals(),
        ),
      ]);
      const decimals = Number(decimalsRaw);

      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
        throw new BadRequestException(
          `Invalid token decimals for ${token.address} on chain ${chainId}`,
        );
      }

      const metadata = {
        symbol: String(symbol),
        decimals: decimals.toString(),
      };
      await this.setRedisCachedMetadata(cacheKey, metadata);
      return metadata;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }

      this.logger.warn(
        `Failed to resolve token metadata for ${token.address} on chain ${chainId}`,
        err instanceof Error ? err.message : err,
      );
      throw new BadRequestException(
        `Unable to resolve token metadata for ${token.address} on chain ${chainId}`,
      );
    }
  }

  private isNativeToken(address: string): boolean {
    return NATIVE_TOKEN_ADDRESSES.has(address.toLowerCase());
  }

  private isSupportedQuoteChainId(chainId: number): chainId is ChainId {
    return (SUPPORTED_QUOTE_CHAIN_IDS as readonly number[]).includes(chainId);
  }

  private async getCatalogMetadata(
    chainId: number,
    address: string,
  ): Promise<TokenMetadata | undefined> {
    const catalog = await this.getTokenCatalog(chainId);

    if (!catalog) {
      return undefined;
    }

    const entry = catalog[address];

    return entry
      ? {
          symbol: entry.symbol,
          decimals: String(entry.decimals),
        }
      : undefined;
  }

  private getTokenCatalog(
    chainId: number,
  ): Promise<Record<string, TokenCatalogEntry> | undefined> {
    return this.loadTokenCatalog(chainId);
  }

  private async loadTokenCatalog(
    chainId: number,
  ): Promise<Record<string, TokenCatalogEntry> | undefined> {
    for (const fileName of this.getTokenCatalogFileNames(chainId)) {
      try {
        const catalogModule = (await import(`../tokens/${fileName}`)) as Record<
          string,
          unknown
        >;
        const catalog = this.extractTokenCatalog(catalogModule);

        if (catalog) {
          return catalog;
        }
      } catch (err) {
        if (!this.isMissingTokenCatalogError(err)) {
          throw err;
        }
      }
    }

    return undefined;
  }

  private getTokenCatalogFileNames(chainId: number): string[] {
    const chainKey = ChainId[chainId] as keyof typeof ChainEnum | undefined;
    const chainName = chainKey ? ChainEnum[chainKey] : undefined;

    return Array.from(
      new Set(
        [TOKEN_FILE_BY_CHAIN_ID[chainId], chainName, String(chainId)].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    );
  }

  private extractTokenCatalog(
    catalogModule: Record<string, unknown>,
  ): Record<string, TokenCatalogEntry> | undefined {
    const catalog = Object.values(catalogModule).find((value) =>
      this.isTokenCatalog(value),
    ) as Record<string, TokenCatalogEntry> | undefined;

    return catalog;
  }

  private isTokenCatalog(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    return Object.values(value).some((entry) => this.normalizeMetadata(entry));
  }

  private isMissingTokenCatalogError(err: unknown): boolean {
    const candidate = err as { code?: unknown; message?: unknown };

    return (
      candidate.code === 'MODULE_NOT_FOUND' ||
      candidate.code === 'ERR_MODULE_NOT_FOUND' ||
      (typeof candidate.message === 'string' &&
        candidate.message.includes('Cannot find module'))
    );
  }

  private async getRedisCachedMetadata(
    cacheKey: string,
  ): Promise<TokenMetadata | undefined> {
    if (!this.redisService) {
      return undefined;
    }

    try {
      const raw = await this.redisService.getKey(cacheKey);
      if (!raw) {
        return undefined;
      }

      return this.normalizeMetadata(JSON.parse(raw));
    } catch (err) {
      this.logger.warn(
        `Failed to read token metadata cache for ${cacheKey}`,
        err instanceof Error ? err.message : err,
      );
      return undefined;
    }
  }

  private async setRedisCachedMetadata(
    cacheKey: string,
    metadata: TokenMetadata,
  ): Promise<void> {
    if (!this.redisService) {
      return;
    }

    try {
      await this.redisService.setKey(cacheKey, JSON.stringify(metadata));
    } catch (err) {
      this.logger.warn(
        `Failed to write token metadata cache for ${cacheKey}`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  private normalizeMetadata(value: unknown): TokenMetadata | undefined {
    const candidate = value as {
      symbol?: unknown;
      decimals?: unknown;
    };
    const decimals = Number(candidate?.decimals);

    if (
      typeof candidate?.symbol !== 'string' ||
      !candidate.symbol.trim() ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 36
    ) {
      return undefined;
    }

    return {
      symbol: candidate.symbol,
      decimals: decimals.toString(),
    };
  }

  private getNativeTokenSymbol(chainId: ChainId): string {
    const symbol = NATIVE_TOKEN_SYMBOL_BY_CHAIN_ID[chainId];
    if (!symbol) {
      throw new BadRequestException(
        `Unsupported native token chainId: ${chainId}`,
      );
    }

    return symbol;
  }
}
