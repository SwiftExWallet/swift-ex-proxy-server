import { BridgeStatus } from './bridge-status.type';
import { BridgeDirection } from './bridge-direction.type';
import { EvmSourceChain } from '../evm/evm-source-chain';

export type SigningRequestType = 'EVM' | 'STELLAR';

export type SigningRequestPurpose =
  | 'APPROVAL'
  | 'BRIDGE'
  | 'MINT'
  | 'BURN'
  | 'TRUSTLINE';

export interface EvmSigningRequest {
  type: 'EVM';

  purpose: 'APPROVAL' | 'BRIDGE' | 'MINT';

  rawTx?: {
    chainId: string;
    type: number;
    nonce: string;
    gasPrice: string;
    gasLimit: string;
    value: string;
    to: string;
    data: string;
  };
}

export interface StellarSigningRequest {
  type: 'STELLAR';

  purpose: 'APPROVAL' | 'MINT' | 'BURN' | 'TRUSTLINE';

  xdr: string;
}

export type BridgeSigningRequest = EvmSigningRequest | StellarSigningRequest;

export interface BridgeTransfer {
  id: string;

  direction: BridgeDirection;
  idempotencyKey?: string | null;
  sourceChain?: EvmSourceChain | null;
  sourceChainId?: number | null;
  sourceRouterAddress?: string | null;

  evmAddress: string;
  stellarAddress: string;

  amount: string;
  amountRaw: string;

  fast: boolean;

  feeBps: string;
  maxFee: string;
  minimumReceived: string;
  protocolFeeRaw?: string | null;
  netAmountRaw?: string | null;

  status: BridgeStatus;

  signingRequest?: BridgeSigningRequest | null;

  sourceTxHash?: string | null;
  destinationTxHash?: string | null;

  message?: string | null;
  attestation?: string | null;

  stellarUnsignedXdr?: string | null;
  signedStellarXdr?: string | null;
  evmUnsignedTx?: EvmSigningRequest['rawTx'] | null;
  signedEvmTx?: string | null;
  approvalTxHash?: string | null;
  messageNonce?: string | null;

  sourceDomain?: number | null;
  destinationDomain?: number | null;
  sourceTokenMessenger?: string | null;
  destinationTokenMessenger?: string | null;
  sourceMessageTransmitter?: string | null;
  destinationMessageTransmitter?: string | null;
  sourceUsdcAddress?: string | null;
  destinationUsdcAddress?: string | null;

  activeStellarKey?: string | null;
  revision?: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;

  error?: string | null;

  createdAt: Date;
  updatedAt: Date;
}
