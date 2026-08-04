import { Injectable, Logger } from '@nestjs/common';
import { SwapOrderStatus } from '../common/enums/order.enum';
import { ChainId } from '../common/enums/chain.enum';

interface BlockscoutReceiptResponse {
    status: '0' | '1';
    message: string;
    result: {
        status: '0' | '1';
    } | null;
}

function mapBlockscoutStatus(result: BlockscoutReceiptResponse): SwapOrderStatus | null {
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

interface EthProxyReceiptResponse {
    jsonrpc: string;
    id: number;
    result: {
        status: '0x0' | '0x1';
    } | null;
}

function mapEthProxyStatus(response: EthProxyReceiptResponse): SwapOrderStatus | null {
    if (!response.result) {
        return null;
    }

    if (response.result.status === '0x0') {
        return SwapOrderStatus.FAILED;
    }

    if (response.result.status === '0x1') {
        return SwapOrderStatus.COMPLETED;
    }

    return null;
}

const ETHERSCAN_V2_BASE_URL = 'https://api.etherscan.io/v2/api';
@Injectable()
export class TxReceiptStatusService {
    private readonly logger = new Logger(TxReceiptStatusService.name);

    private readonly blockscoutUrls: Record<string, string> = {
        ETH: process.env.BLOCKSCOUT_ETH as string,
        BSC: process.env.BLOCKSCOUT_BSC as string,
        POL: process.env.BLOCKSCOUT_POL as string,
        ARB: process.env.BLOCKSCOUT_ARB as string,
        OPT: process.env.BLOCKSCOUT_OPT as string,
        BASE: process.env.BLOCKSCOUT_BAS as string,
        AVAX: process.env.BLOCKSCOUT_AVA as string,
    };

    private readonly etherscanApiKeys: string[] = [
        process.env.ETHERSCAN_API_KEY_1,
        process.env.ETHERSCAN_API_KEY_2,
        process.env.ETHERSCAN_API_KEY_3,
        process.env.ETHERSCAN_API_KEY_4,
    ].filter(Boolean) as string[];
    private etherscanKeyCounter = 0;

    async getStatus(fromChain: string, txHash: string): Promise<SwapOrderStatus | null> {
        const chainKey = fromChain?.toUpperCase() ?? '';
        const baseUrl = this.blockscoutUrls[chainKey];

        const blockscoutResponse = baseUrl
            ? await this.fetchFromBlockscout(baseUrl, chainKey, txHash)
            : null;

        if (blockscoutResponse) {
            return mapBlockscoutStatus(blockscoutResponse);
        }

        const etherscanResponse = await this.fetchFromEtherscan(chainKey, txHash);
        if (etherscanResponse) {
            return mapEthProxyStatus(etherscanResponse);
        }

        this.logger.error(`Both blockscout and etherscan failed for txHash ${txHash} chain ${fromChain}`);
        return null;
    }

    private getEtherscanApiKey(): string {
        return this.etherscanApiKeys[this.etherscanKeyCounter++ % this.etherscanApiKeys.length];
    }

    private getErrorMessage(err: unknown): unknown {
        return err instanceof Error ? err.message : err;
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
                    `blockscout HTTP ${res.status} for txHash ${txHash} chain ${chainKey}, falling back to etherscan`,
                );
                return null;
            }

            return (await res.json()) as BlockscoutReceiptResponse;
        } catch (err) {
            this.logger.warn(
                `blockscout fetch error txHash ${txHash} chain ${chainKey}, falling back to etherscan: ${this.getErrorMessage(err)}`,
            );
            return null;
        }
    }

    private async fetchFromEtherscan(chainKey: string, txHash: string): Promise<EthProxyReceiptResponse | null> {
        const chainId = ChainId[chainKey as keyof typeof ChainId];
        if (!chainId) {
            this.logger.warn(`No Etherscan chainid mapping for chain ${chainKey} txHash ${txHash}`);
            return null;
        }

        if (!this.etherscanApiKeys.length) {
            this.logger.error(`No Etherscan API keys configured, cannot fallback for txHash ${txHash}`);
            return null;
        }

        try {
            const url =
                `${ETHERSCAN_V2_BASE_URL}` +
                `?chainid=${chainId}` +
                `&module=proxy` +
                `&action=eth_getTransactionReceipt` +
                `&txhash=${encodeURIComponent(txHash)}` +
                `&apikey=${this.getEtherscanApiKey()}`;

            const res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(8_000),
            });

            if (!res.ok) {
                this.logger.warn(`etherscan HTTP ${res.status} for txHash ${txHash} chain ${chainKey}`);
                return null;
            }

            return (await res.json()) as EthProxyReceiptResponse;
        } catch (err) {
            this.logger.error(
                `etherscan fetch error txHash ${txHash} chain ${chainKey}`,
                this.getErrorMessage(err),
            );
            return null;
        }
    }
}
