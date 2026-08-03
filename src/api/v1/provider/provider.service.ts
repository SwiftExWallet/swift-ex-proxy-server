import { Injectable } from '@nestjs/common';
import { JsonRpcProvider, Contract, Network } from 'ethers';
import { ChainEnum, ChainId } from '../common/enums/chain.enum';
import {
  getProviderRpcAllowedHosts,
  validateOptionalProviderUrl,
  validateProviderUrlList,
} from '../common/config/provider-url.config';

@Injectable()
export class ProviderService {
  readonly bscProvider: JsonRpcProvider;
  readonly rpcUrls: string[];
  counter: number = 0;
  private readonly rpcAllowedHosts = getProviderRpcAllowedHosts();
  private readonly chainRpcUrls: Partial<Record<ChainEnum, string[]>>;
  private readonly chainCounters: Partial<Record<ChainEnum, number>> = {};

  constructor() {
    this.rpcUrls = this.getValidatedRpcUrls(
      [
        process.env.PROVIDER_RPC_ETH_1,
        process.env.PROVIDER_RPC_ETH_2,
        process.env.PROVIDER_RPC_ETH_3,
        process.env.PROVIDER_RPC_ETH_4,
        process.env.PROVIDER_RPC_ETH_5,
      ],
      'PROVIDER_RPC_ETH',
      this.rpcAllowedHosts,
    );

    const bscRpcUrl = validateOptionalProviderUrl(
      process.env.PROVIDER_RPC_BSC,
      {
        source: 'PROVIDER_RPC_BSC',
        allowedHosts: this.rpcAllowedHosts,
      },
    );
    this.bscProvider = new JsonRpcProvider(bscRpcUrl || '');
    this.chainRpcUrls = {
      [ChainEnum.ETH]: this.rpcUrls,

      [ChainEnum.BSC]: [bscRpcUrl].filter(Boolean) as string[],

      [ChainEnum.BNB]: [bscRpcUrl].filter(Boolean) as string[],

      [ChainEnum.POL]: this.getValidatedRpcUrls(
        [
          process.env.PROVIDER_RPC_POL_1,
          process.env.PROVIDER_RPC_POL_2,
          process.env.PROVIDER_RPC_POL_3,
        ],
        'PROVIDER_RPC_POL',
        this.rpcAllowedHosts,
      ),
      [ChainEnum.MATIC]: this.getValidatedRpcUrls(
        [
          process.env.PROVIDER_RPC_POL_1,
          process.env.PROVIDER_RPC_POL_2,
          process.env.PROVIDER_RPC_POL_3,
        ],
        'PROVIDER_RPC_POL',
        this.rpcAllowedHosts,
      ),

      [ChainEnum.ARB]: this.getValidatedRpcUrls(
        [
          process.env.PROVIDER_RPC_ARB_1,
          process.env.PROVIDER_RPC_ARB_2,
          process.env.PROVIDER_RPC_ARB_3,
        ],
        'PROVIDER_RPC_ARB',
        this.rpcAllowedHosts,
      ),

      [ChainEnum.BASE]: this.getValidatedRpcUrls(
        [
          process.env.PROVIDER_RPC_BASE_1,
          process.env.PROVIDER_RPC_BASE_2,
          process.env.PROVIDER_RPC_BASE_3,
        ],
        'PROVIDER_RPC_BASE',
        this.rpcAllowedHosts,
      ),

      [ChainEnum.AVAX]: this.getValidatedRpcUrls(
        [
          process.env.PROVIDER_RPC_AVAX_1,
          process.env.PROVIDER_RPC_AVAX_2,
          process.env.PROVIDER_RPC_AVAX_3,
        ],
        'PROVIDER_RPC_AVAX',
        this.rpcAllowedHosts,
      ),

      [ChainEnum.OP]: this.getValidatedRpcUrls(
        [
          process.env.PROVIDER_RPC_OPT_1,
          process.env.PROVIDER_RPC_OPT_2,
          process.env.PROVIDER_RPC_OPT_3,
        ],
        'PROVIDER_RPC_OPT',
        this.rpcAllowedHosts,
      ),

      [ChainEnum.OP138]: this.getValidatedRpcUrls(
        [
          process.env.PROVIDER_RPC_138_1,
          process.env.PROVIDER_RPC_138_2,
          process.env.PROVIDER_RPC_138_3,
        ],
        'PROVIDER_RPC_138',
        this.rpcAllowedHosts,
      ),
    };
  }

  private getValidatedRpcUrls(
    urls: Array<string | undefined>,
    source: string,
    allowedHosts: readonly string[],
  ): string[] {
    return validateProviderUrlList(urls, {
      source,
      allowedHosts,
    });
  }

  private getChainNetworkId: Partial<Record<ChainEnum, number>> = {
    [ChainEnum.ETH]: 1,
    [ChainEnum.BSC]: 56,
    [ChainEnum.POL]: 137,
    [ChainEnum.ARB]: 42161,
    [ChainEnum.BASE]: 8453,
    [ChainEnum.AVAX]: 43114,
    [ChainEnum.OP]: 10,
    [ChainEnum.OP138]: 138,
  };

  getProvider(chain: ChainEnum): JsonRpcProvider {
    if (chain === ChainEnum.ETH) {
      return new JsonRpcProvider(this.getRpcUrl(), Network.from(1), {
        staticNetwork: true,
      });
    }

    if (chain === ChainEnum.BSC) {
      return this.bscProvider;
    }

    const url = this.getChainRpcUrl(chain);
    const chainId = this.getChainNetworkId[chain];

    return new JsonRpcProvider(url, Network.from(chainId), {
      staticNetwork: true,
    });
  }

  getProviderForChainId(chainId: number): JsonRpcProvider {
    const chain = this.resolveChainEnum(chainId);
    if (chain) {
      return this.getProvider(chain);
    }

    return new JsonRpcProvider(
      this.getDynamicChainRpcUrl(chainId),
      Network.from(chainId),
      {
        staticNetwork: true,
      },
    );
  }

  getContract(address: string, abi: any, chain: ChainEnum): Contract {
    const provider = this.getProvider(chain);
    return new Contract(address, abi, provider);
  }

  getRpcUrl() {
    return this.rpcUrls[this.counter++ % this.rpcUrls.length];
  }

  public getChainRpcUrl(chain: ChainEnum): string {
    const urls = this.chainRpcUrls[chain];

    if (!urls || urls.length === 0) {
      throw new Error(`No RPC URLs configured for chain: ${chain}`);
    }

    this.chainCounters[chain] = this.chainCounters[chain] ?? 0;
    const url = urls[this.chainCounters[chain]++ % urls.length];
    return url;
  }

  private resolveChainEnum(chainId: number): ChainEnum | undefined {
    const chainKey = ChainId[chainId] as keyof typeof ChainEnum | undefined;
    return chainKey ? ChainEnum[chainKey] : undefined;
  }

  private getDynamicChainRpcUrl(chainId: number): string {
    const source = `PROVIDER_RPC_${chainId}`;
    const urls = this.getValidatedRpcUrls(
      [
        process.env[source],
        process.env[`${source}_1`],
        process.env[`${source}_2`],
        process.env[`${source}_3`],
        process.env[`${source}_4`],
        process.env[`${source}_5`],
      ],
      source,
      this.rpcAllowedHosts,
    );

    if (urls.length === 0) {
      throw new Error(`No RPC URLs configured for chain: ${chainId}`);
    }

    return urls[0];
  }
}
