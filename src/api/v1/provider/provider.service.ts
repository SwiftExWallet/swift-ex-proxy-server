import { Injectable } from '@nestjs/common';
import { JsonRpcProvider, Contract } from 'ethers';
import { ChainEnum } from '../common/enums/chain.enum';

@Injectable()
export class ProviderService {
  readonly ethProvider: JsonRpcProvider;
  readonly bscProvider: JsonRpcProvider;

  constructor() {
    this.ethProvider = new JsonRpcProvider(process.env.PROVIDER_RPC_ETH || '');
    this.bscProvider = new JsonRpcProvider(process.env.PROVIDER_RPC_BSC || '');
  }

  getProvider(chain: ChainEnum): JsonRpcProvider {
    return chain === ChainEnum.ETH ? this.ethProvider : this.bscProvider;
  }

  getContract(address: string, abi: any, chain: ChainEnum): Contract {
    const provider = this.getProvider(chain);
    return new Contract(address, abi, provider);
  }
}
