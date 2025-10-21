import { Injectable } from '@nestjs/common';
import { JsonRpcProvider, Contract } from 'ethers';
import { ChainEnum } from '../common/enums/chain.enum';

@Injectable()
export class ProviderService {
  readonly bscProvider: JsonRpcProvider;
  readonly rpcUrls: string[];
  counter: number = 0;
  constructor() {
    this.rpcUrls = [
      process.env.PROVIDER_RPC_ETH_1,
      process.env.PROVIDER_RPC_ETH_2,
      process.env.PROVIDER_RPC_ETH_3,
      process.env.PROVIDER_RPC_ETH_4,
      process.env.PROVIDER_RPC_ETH_5,
    ].filter(Boolean) as string[];
    this.bscProvider = new JsonRpcProvider(process.env.PROVIDER_RPC_BSC || '');
  }

  getProvider(chain: ChainEnum): JsonRpcProvider {
    return chain === ChainEnum.ETH
      ? new JsonRpcProvider(this.getRpcUrl())
      : this.bscProvider;
  }

  getContract(address: string, abi: any, chain: ChainEnum): Contract {
    const provider = this.getProvider(chain);
    return new Contract(address, abi, provider);
  }

  getRpcUrl() {
    return this.rpcUrls[this.counter++ % this.rpcUrls.length];
  }
}
