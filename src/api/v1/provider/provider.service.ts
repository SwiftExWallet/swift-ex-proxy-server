import { Injectable } from '@nestjs/common';
import { JsonRpcProvider, Contract, Network } from 'ethers';
import { ChainEnum } from '../common/enums/chain.enum';

@Injectable()
export class ProviderService {
  readonly bscProvider: JsonRpcProvider;
  readonly rpcUrls: string[];
  counter: number = 0;
  private readonly chainRpcUrls: Partial<Record<ChainEnum, string[]>>;
  private readonly chainCounters: Partial<Record<ChainEnum, number>> = {};

  constructor() {
    this.rpcUrls = [
      process.env.PROVIDER_RPC_ETH_1,
      process.env.PROVIDER_RPC_ETH_2,
      process.env.PROVIDER_RPC_ETH_3,
      process.env.PROVIDER_RPC_ETH_4,
      process.env.PROVIDER_RPC_ETH_5,
    ].filter(Boolean) as string[];

    this.bscProvider = new JsonRpcProvider(process.env.PROVIDER_RPC_BSC || '');
    this.chainRpcUrls = {
      [ChainEnum.ETH]: [
        process.env.PROVIDER_RPC_ETH_1,
        process.env.PROVIDER_RPC_ETH_2,
        process.env.PROVIDER_RPC_ETH_3,
        process.env.PROVIDER_RPC_ETH_4,
        process.env.PROVIDER_RPC_ETH_5,
      ].filter(Boolean) as string[],

      [ChainEnum.BSC]: [
        process.env.PROVIDER_RPC_BSC,
      ].filter(Boolean) as string[],

      [ChainEnum.POL]: [
        process.env.PROVIDER_RPC_POL_1,
        process.env.PROVIDER_RPC_POL_2,
        process.env.PROVIDER_RPC_POL_3,
      ].filter(Boolean) as string[],

      [ChainEnum.ARB]: [
        process.env.PROVIDER_RPC_ARB_1,
        process.env.PROVIDER_RPC_ARB_2,
        process.env.PROVIDER_RPC_ARB_3,
      ].filter(Boolean) as string[],

      [ChainEnum.BASE]: [
        process.env.PROVIDER_RPC_BASE_1,
        process.env.PROVIDER_RPC_BASE_2,
        process.env.PROVIDER_RPC_BASE_3,
      ].filter(Boolean) as string[],

      [ChainEnum.AVAX]: [
        process.env.PROVIDER_RPC_AVAX_1,
        process.env.PROVIDER_RPC_AVAX_2,
        process.env.PROVIDER_RPC_AVAX_3,
      ].filter(Boolean) as string[],

      [ChainEnum.OP]: [
        process.env.PROVIDER_RPC_OPT_1,
        process.env.PROVIDER_RPC_OPT_2,
        process.env.PROVIDER_RPC_OPT_3,
      ].filter(Boolean) as string[],
    };
  }

  private getChainNetworkId: Partial<Record<ChainEnum, number>> = {
    [ChainEnum.ETH]: 1,
    [ChainEnum.BSC]: 56,
    [ChainEnum.POL]: 137,
    [ChainEnum.ARB]: 42161,
    [ChainEnum.BASE]: 8453,
    [ChainEnum.AVAX]: 43114,
    [ChainEnum.OP]: 10,
  };

  getProvider(chain: ChainEnum): JsonRpcProvider {
    if (chain === ChainEnum.ETH) {
      return new JsonRpcProvider(
        this.getRpcUrl(),
        Network.from(1),
        { staticNetwork: true }
      );
    }

    if (chain === ChainEnum.BSC) {
      return this.bscProvider;
    }

    const url = this.getChainRpcUrl(chain);
    const chainId = this.getChainNetworkId[chain];

    return new JsonRpcProvider(
      url,
      Network.from(chainId),
      { staticNetwork: true }
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
}