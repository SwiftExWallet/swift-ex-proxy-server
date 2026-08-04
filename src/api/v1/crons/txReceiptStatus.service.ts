import { Injectable, Logger } from '@nestjs/common';
import { SwapOrderStatus } from '../common/enums/order.enum';

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

// Shared by EvmTxPollerService and UniswapTxPollerService: checks a tx
// receipt via Blockscout's per-chain domain.
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

    async getStatus(fromChain: string, txHash: string): Promise<SwapOrderStatus | null> {
        const chainKey = fromChain?.toUpperCase() ?? '';
        const baseUrl = this.blockscoutUrls[chainKey];

        if (!baseUrl) {
            this.logger.warn(`No blockscout URL for chain ${fromChain} txHash ${txHash}`);
            return null;
        }

        const response = await this.fetchFromBlockscout(baseUrl, chainKey, txHash);
        if (!response) {
            return null;
        }

        return mapBlockscoutStatus(response);
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
                this.logger.warn(`blockscout HTTP ${res.status} for txHash ${txHash} chain ${chainKey}`);
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
