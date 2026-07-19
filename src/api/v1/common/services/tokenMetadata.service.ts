import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Contract, ZeroAddress } from 'ethers';
import { ETH_ERC20_ABI } from '../abi/eth';
import { ChainEnum, ChainId } from '../enums/chain.enum';
import { ProviderService } from '../../provider/provider.service';
import { SwapQuoteDto, TokenInfoDto } from '../dto/swapQuote.dto';

type TokenMetadata = {
  symbol: string;
  decimals: string;
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
  private readonly cache = new Map<string, TokenMetadata>();

  constructor(private readonly providerService: ProviderService) {}

  async normalizeSwapQuote(dto: SwapQuoteDto): Promise<SwapQuoteDto> {
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

  async resolveToken(token: TokenInfoDto): Promise<TokenInfoDto> {
    const metadata = await this.resolveMetadata(token);

    return {
      ...token,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
    };
  }

  private async resolveMetadata(token: TokenInfoDto): Promise<TokenMetadata> {
    const chainId = Number(token.chainId) as ChainId;
    if (!this.isSupportedChainId(chainId)) {
      throw new BadRequestException(
        `Unsupported token chainId: ${token.chainId}`,
      );
    }

    if (this.isNativeToken(token.address)) {
      return {
        symbol: this.getNativeTokenSymbol(chainId),
        decimals: '18',
      };
    }

    const cacheKey = `${chainId}:${token.address.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const chain = this.getChainEnum(chainId);
      const contract = new Contract(
        token.address,
        ETH_ERC20_ABI,
        this.providerService.getProvider(chain),
      );
      const [symbol, decimalsRaw] = await Promise.all([
        contract.symbol(),
        contract.decimals(),
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
      this.cache.set(cacheKey, metadata);
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

  private getNativeTokenSymbol(chainId: ChainId): string {
    const symbol = NATIVE_TOKEN_SYMBOL_BY_CHAIN_ID[chainId];
    if (!symbol) {
      throw new BadRequestException(
        `Unsupported native token chainId: ${chainId}`,
      );
    }

    return symbol;
  }

  private getChainEnum(chainId: ChainId): ChainEnum {
    const chainKey = ChainId[chainId] as keyof typeof ChainEnum | undefined;
    const chain = chainKey ? ChainEnum[chainKey] : undefined;

    if (!chain) {
      throw new BadRequestException(`Unsupported token chainId: ${chainId}`);
    }

    return chain;
  }

  private isSupportedChainId(chainId: number): chainId is ChainId {
    return Object.values(ChainId).includes(chainId as ChainId);
  }
}
