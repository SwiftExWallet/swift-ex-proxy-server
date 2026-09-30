import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { bridgeConfig } from '../bridge-config';
import { normalizeStellarHash, validateAttestation } from './cctp-message';

export interface CircleAttestation {
  message: string;
  attestation: string;
}
const isHex = (value: unknown): value is string =>
  typeof value === 'string' && /^0x(?:[a-fA-F0-9]{2})+$/.test(value);

@Injectable()
export class CircleService {
  constructor(private readonly config: ConfigService) {}

  async getStellarAttestation(
    txHash: string,
  ): Promise<CircleAttestation | null> {
    const hash = normalizeStellarHash(txHash);
    const response = await this.request(
      `/v2/messages/27?transactionHash=${hash}`,
    );
    if ([404, 429].includes(response.status) || response.status >= 500)
      return null;
    if (!response.ok)
      throw new BadGatewayException(
        `Circle attestation HTTP ${response.status}`,
      );
    const body = await this.json(response);
    if (body.sourceTxHash && normalizeStellarHash(body.sourceTxHash) !== hash) {
      throw new BadGatewayException('Circle source transaction mismatch');
    }
    if (!Array.isArray(body.messages) || body.messages.length > 1)
      throw new BadGatewayException('Invalid or ambiguous Circle messages');
    const result = body.messages[0];
    if (!result || result.status !== 'complete') return null;
    if (Number(result.cctpVersion) !== 2 || !isHex(result.message))
      throw new BadGatewayException('Expected CCTP V2 message');
    validateAttestation(result.attestation);
    return { message: result.message, attestation: result.attestation };
  }

  async getStellarBurnFee(): Promise<string> {
    const response = await this.request(
      `/v2/burn/USDC/fees/27/${this.sourceDomain}`,
    );
    if (!response.ok)
      throw new BadGatewayException('Unable to obtain Circle fee');
    const fees = await this.json(response);
    const value = Array.isArray(fees)
      ? String(
          fees.find((row) => Number(row.finalityThreshold) === 2000)
            ?.minimumFee,
        )
      : '';
    if (!/^\d+(\.\d{1,6})?$/.test(value) || Number(value) > 10000)
      throw new BadGatewayException('Invalid Circle standard fee');
    return value;
  }

  get sourceDomain(): number {
    return this.domain('sourceDomain');
  }
  get destinationDomain(): number {
    return this.domain('destinationDomain');
  }
  private domain(name: string): number {
    const value = bridgeConfig<number>(this.config, `circle.${name}`);
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 0xffffffff ||
      (name === 'sourceDomain' && value === 27) ||
      (name === 'destinationDomain' && value !== 27)
    ) {
      throw new ServiceUnavailableException(
        'Bridge requires a valid source domain and Stellar destination domain 27',
      );
    }
    return value;
  }

  private async request(path: string): Promise<Response> {
    const base = bridgeConfig<string>(this.config, 'circle.irisUrl').replace(
      /\/$/,
      '',
    );
    try {
      return await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BadGatewayException('Circle API is unavailable');
    }
  }

  async getFee(fast: boolean): Promise<string> {
    const response = await this.request(
      `/v2/burn/USDC/fees/${this.sourceDomain}/${this.destinationDomain}`,
    );
    if (!response.ok)
      throw new BadGatewayException('Unable to obtain Circle fee');
    const fees: unknown = await this.json(response);
    const fee = Array.isArray(fees)
      ? fees.find(
          (row) => Number(row?.finalityThreshold) === (fast ? 1000 : 2000),
        )
      : undefined;
    const value = String(fee?.minimumFee);
    if (!/^\d+(\.\d{1,6})?$/.test(value) || Number(value) > 10000) {
      throw new BadGatewayException('Circle returned an invalid fee');
    }
    return value;
  }

  private async json(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      throw new BadGatewayException('Circle returned invalid JSON');
    }
  }

  async getAttestation(
    txHash: string,
    sourceDomain = this.sourceDomain,
  ): Promise<CircleAttestation | null> {
    const response = await this.request(
      `/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(txHash)}`,
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new BadGatewayException('Unable to obtain Circle attestation');
    const body = await this.json(response);
    if (!Array.isArray(body?.messages))
      throw new BadGatewayException('Invalid Circle message response');
    // This router emits exactly one burn. Never choose an arbitrary message.
    if (body.messages.length === 0) return null;
    if (body.messages.length !== 1)
      throw new BadGatewayException('Ambiguous Circle burn messages');
    const result = body.messages[0];
    if (result.status !== 'complete') return null;
    if (!isHex(result.message) || !isHex(result.attestation)) {
      throw new BadGatewayException('Invalid Circle attestation');
    }
    return { message: result.message, attestation: result.attestation };
  }

  async getBurnFee(
    finalityThreshold: number,
    sourceDomain = this.sourceDomain,
  ): Promise<{
    minimumFee: string;
    finalityThreshold: number;
    forwardFee?: string;
  } | null> {
    const response = await this.request(
      `/v2/burn/USDC/fees/${sourceDomain}/${this.destinationDomain}`,
    );
    if (!response.ok) {
      throw new Error(`Circle fee request failed: HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Invalid Circle fee response');
    }

    const fee = data.find(
      (item: any) => Number(item.finalityThreshold) === finalityThreshold,
    );

    if (!fee) {
      return null;
    }

    return {
      minimumFee: String(fee.minimumFee),

      finalityThreshold: Number(fee.finalityThreshold),

      ...(fee.forwardFee?.med !== undefined
        ? { forwardFee: String(fee.forwardFee.med) }
        : {}),
    };
  }
}
