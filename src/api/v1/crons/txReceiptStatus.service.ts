import { Injectable, Logger } from '@nestjs/common';
import { Alchemy, Network } from 'alchemy-sdk';
import { SwapOrderStatus } from '../common/enums/order.enum';
import {
  getBlockscoutAllowedHosts,
  validateOptionalProviderUrl,
} from '../common/config/provider-url.config';

interface BlockscoutReceiptResponse {
  status: '0' | '1';
  message: string;
  result: {
    status: '0' | '1';
  } | null;
}

function mapBlockscoutStatus(
  result: BlockscoutReceiptResponse,
): SwapOrderStatus | null {
  if (result.status === '0' || !result.result) {
    return SwapOrderStatus.FAILED;
  }

  const txStatus = result.result.status;

  if (txStatus === '0') {
    return SwapOrderStatus.FAILED;
  }

  if (txStatus === '1' || txStatus === '') {
    return SwapOrderStatus.COMPLETED;
  }

  return null;
}

function mapAlchemyStatus(
  receipt: { status?: number | null } | null,
): SwapOrderStatus | null {
  if (!receipt) {
    return null;
  }

  if (receipt.status === 0) {
    return SwapOrderStatus.FAILED;
  }

  if (receipt.status === 1) {
    return SwapOrderStatus.COMPLETED;
  }

  return null;
}

// Shared by EvmTxPollerService and UniswapTxPollerService: checks a tx
// receipt via Blockscout's per-chain domain, falling back to Alchemy when
// Blockscout is unreachable or has no answer yet.
@Injectable()
export class TxReceiptStatusService {
  private readonly BLOCKSCOUT_URLS: Partial<Record<string, string>>;

  private readonly logger = new Logger(TxReceiptStatusService.name);

  private getValidatedBlockscoutUrls(): Partial<Record<string, string>> {
    const allowedHosts = getBlockscoutAllowedHosts();
    return {
      ETH: validateOptionalProviderUrl(process.env.BLOCKSCOUT_ETH, {
        source: 'BLOCKSCOUT_ETH',
        allowedHosts,
      }),
      BSC: validateOptionalProviderUrl(process.env.BLOCKSCOUT_BSC, {
        source: 'BLOCKSCOUT_BSC',
        allowedHosts,
      }),
      POL: validateOptionalProviderUrl(process.env.BLOCKSCOUT_POL, {
        source: 'BLOCKSCOUT_POL',
        allowedHosts,
      }),
      ARB: validateOptionalProviderUrl(process.env.BLOCKSCOUT_ARB, {
        source: 'BLOCKSCOUT_ARB',
        allowedHosts,
      }),
      OPT: validateOptionalProviderUrl(process.env.BLOCKSCOUT_OPT, {
        source: 'BLOCKSCOUT_OPT',
        allowedHosts,
      }),
      BASE: validateOptionalProviderUrl(process.env.BLOCKSCOUT_BAS, {
        source: 'BLOCKSCOUT_BAS',
        allowedHosts,
      }),
      AVAX: validateOptionalProviderUrl(process.env.BLOCKSCOUT_AVA, {
        source: 'BLOCKSCOUT_AVA',
        allowedHosts,
      }),
    };
  }

  // One Alchemy client per (chain, API key) so calls can be round-robined
  // across keys the same way fetchFromEtherscan used to.
  private readonly clientAlchemy: Partial<Record<string, Alchemy[]>> = {};
  private alchemyKeyCounter = 0;

  constructor() {
    this.BLOCKSCOUT_URLS = this.getValidatedBlockscoutUrls();

    const alchemyApiKeys: string[] = [
      process.env.ALCHEMY_API_KEY_1,
      process.env.ALCHEMY_API_KEY_2,
      process.env.ALCHEMY_API_KEY_3,
      process.env.ALCHEMY_API_KEY_4,
    ].filter(Boolean) as string[];

    if (!alchemyApiKeys.length && process.env.ALCHEMY_API_KEY) {
      alchemyApiKeys.push(process.env.ALCHEMY_API_KEY);
    }

    const alchemyNetworkByChain: Record<string, string | undefined> = {
      ETH: process.env.ALCHEMY_ETH_NETWORK,
      BSC: process.env.ALCHEMY_BSC_NETWORK,
      POL: process.env.ALCHEMY_POL_NETWORK,
      ARB: process.env.ALCHEMY_ARB_NETWORK,
      OPT: process.env.ALCHEMY_OPT_NETWORK,
      BASE: process.env.ALCHEMY_BAS_NETWORK,
      AVAX: process.env.ALCHEMY_AVA_NETWORK,
    };

    for (const [chainKey, networkKey] of Object.entries(
      alchemyNetworkByChain,
    )) {
      if (!networkKey || !(networkKey in Network) || !alchemyApiKeys.length) {
        continue;
      }

      const network = Network[networkKey as keyof typeof Network];
      this.clientAlchemy[chainKey] = alchemyApiKeys.map(
        (apiKey) => new Alchemy({ apiKey, network }),
      );
    }
  }

  private getAlchemyClient(chainKey: string): Alchemy | null {
    const clients = this.clientAlchemy[chainKey];
    if (!clients?.length) {
      return null;
    }

    return clients[this.alchemyKeyCounter++ % clients.length];
  }

  async getStatus(
    fromChain: string,
    txHash: string,
  ): Promise<SwapOrderStatus | null> {
    const chainKey = fromChain?.toUpperCase() ?? '';
    const baseUrl = this.BLOCKSCOUT_URLS[chainKey];

    const blockscoutResponse = baseUrl
      ? await this.fetchFromBlockscout(baseUrl, chainKey, txHash)
      : null;

    if (blockscoutResponse) {
      return mapBlockscoutStatus(blockscoutResponse);
    }

    const alchemyStatus = await this.fetchFromAlchemy(chainKey, txHash);
    if (alchemyStatus !== null) {
      return alchemyStatus;
    }

    this.logger.debug(
      `Both blockscout and alchemy have no result yet for txHash ${txHash} chain ${fromChain}`,
    );
    return null;
  }

  private getErrorMessage(err: unknown): unknown {
    return err instanceof Error ? err.message : err;
  }

  private async fetchFromAlchemy(
    chainKey: string,
    txHash: string,
  ): Promise<SwapOrderStatus | null> {
    const alchemy = this.getAlchemyClient(chainKey);
    if (!alchemy) {
      this.logger.warn(
        `No Alchemy client configured for chain ${chainKey}, cannot fallback for txHash ${txHash}`,
      );
      return null;
    }

    try {
      const receipt = await alchemy.core.getTransactionReceipt(txHash);
      return mapAlchemyStatus(receipt);
    } catch (err) {
      this.logger.error(
        `alchemy fetch error txHash ${txHash} chain ${chainKey}`,
        this.getErrorMessage(err),
      );
      return null;
    }
  }

  private async fetchFromBlockscout(
    baseUrl: string,
    chainKey: string,
    txHash: string,
  ): Promise<BlockscoutReceiptResponse | null> {
    try {
      const url =
        `${baseUrl}/api` +
        `?module=transaction` +
        `&action=gettxreceiptstatus` +
        `&txhash=${encodeURIComponent(txHash)}`;

      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        this.logger.warn(
          `blockscout HTTP ${res.status} for txHash ${txHash} chain ${chainKey}`,
        );
        return null;
      }

      return (await res.json()) as BlockscoutReceiptResponse;
    } catch (err) {
      this.logger.error(
        `blockscout fetch error txHash ${txHash} chain ${chainKey}`,
        this.getErrorMessage(err),
      );
      return null;
    }
  }
}
