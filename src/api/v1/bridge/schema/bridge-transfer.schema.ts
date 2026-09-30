import { randomUUID } from 'node:crypto';
import { Schema } from 'mongoose';
import { BridgeTransfer } from '../types/bridge-transfer.type';
import { BridgeStatus } from '../types/bridge-status.type';
import { BridgeDirection } from '../types/bridge-direction.type';
import { EvmSourceChain } from '../evm/evm-source-chain';

export const BRIDGE_TRANSFER_MODEL = 'BridgeTransfer';

export const BridgeTransferSchema = new Schema<BridgeTransfer>(
  {
    id: { type: String, required: true, unique: true, default: randomUUID },
    direction: {
      type: String,
      enum: Object.values(BridgeDirection),
      required: true,
      default: BridgeDirection.EVM_TO_STELLAR,
    },
    idempotencyKey: { type: String },
    sourceChain: { type: String, enum: Object.values(EvmSourceChain) },
    sourceChainId: { type: Number, default: null },
    sourceRouterAddress: { type: String, default: null },
    evmAddress: { type: String, required: true },
    stellarAddress: { type: String, required: true },
    amount: { type: String, required: true },
    amountRaw: { type: String, required: true },
    fast: { type: Boolean, required: true },
    feeBps: { type: String, required: true },
    maxFee: { type: String, required: true },
    minimumReceived: { type: String, required: true },
    protocolFeeRaw: { type: String, default: null },
    netAmountRaw: { type: String, default: null },
    status: { type: String, enum: Object.values(BridgeStatus), required: true },
    sourceTxHash: { type: String, default: null },
    destinationTxHash: { type: String, default: null },
    message: { type: String, default: null },
    attestation: { type: String, default: null },
    stellarUnsignedXdr: { type: String, default: null },
    signedStellarXdr: { type: String, default: null, select: false },
    evmUnsignedTx: { type: Schema.Types.Mixed, default: null },
    signedEvmTx: { type: String, default: null, select: false },
    approvalTxHash: { type: String, default: null },
    messageNonce: { type: String, default: null },
    sourceDomain: { type: Number, default: null },
    destinationDomain: { type: Number, default: null },
    sourceTokenMessenger: { type: String, default: null },
    destinationTokenMessenger: { type: String, default: null },
    sourceMessageTransmitter: { type: String, default: null },
    destinationMessageTransmitter: { type: String, default: null },
    sourceUsdcAddress: { type: String, default: null },
    destinationUsdcAddress: { type: String, default: null },
    activeStellarKey: { type: String },
    revision: { type: Number, required: true, default: 0 },
    leaseOwner: { type: String, default: null, select: false },
    leaseExpiresAt: { type: Date, default: null, select: false },
    error: { type: String, default: null },
  },
  { collection: 'BridgeTransfer', timestamps: true, id: false },
);

BridgeTransferSchema.index({ evmAddress: 1, createdAt: -1 });
BridgeTransferSchema.index(
  { stellarAddress: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);
BridgeTransferSchema.index(
  { activeStellarKey: 1 },
  {
    unique: true,
    partialFilterExpression: { activeStellarKey: { $type: 'string' } },
  },
);
