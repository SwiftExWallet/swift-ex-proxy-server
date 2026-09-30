import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getAddress } from 'ethers';
import { BRIDGE_TRANSFER_MODEL } from '../schema/bridge-transfer.schema';
import { BridgeTransfer } from '../types/bridge-transfer.type';
import { BridgeStatus } from '../types/bridge-status.type';
import { BridgeDirection } from '../types/bridge-direction.type';
import { EvmSourceChain } from '../evm/evm-source-chain';

export interface CreateBridgeTransferData {
  direction?: BridgeDirection;
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
  status: BridgeStatus;
  protocolFeeRaw?: string | null;
  netAmountRaw?: string | null;
  stellarUnsignedXdr?: string | null;
  sourceDomain?: number | null;
  destinationDomain?: number | null;
  sourceTokenMessenger?: string | null;
  destinationTokenMessenger?: string | null;
  sourceMessageTransmitter?: string | null;
  destinationMessageTransmitter?: string | null;
  sourceUsdcAddress?: string | null;
  destinationUsdcAddress?: string | null;
  activeStellarKey?: string | null;
}

export interface UpdateBridgeTransferData {
  status?: BridgeStatus;

  sourceTxHash?: string | null;
  destinationTxHash?: string | null;

  message?: string | null;
  attestation?: string | null;

  stellarUnsignedXdr?: string | null;
  signedStellarXdr?: string | null;
  evmUnsignedTx?: BridgeTransfer['evmUnsignedTx'];
  signedEvmTx?: string | null;
  approvalTxHash?: string | null;
  messageNonce?: string | null;
  activeStellarKey?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;

  error?: string | null;
}

@Injectable()
export class BridgeRepository {
  constructor(
    @InjectModel(BRIDGE_TRANSFER_MODEL)
    private readonly model: Model<BridgeTransfer>,
  ) {}

  async create(data: CreateBridgeTransferData): Promise<BridgeTransfer> {
    const document = await this.model.create({
      ...data,
      evmAddress: getAddress(data.evmAddress),
    });
    const transfer = document.toObject<
      BridgeTransfer & { _id?: unknown; __v?: number }
    >();
    delete transfer._id;
    delete transfer.__v;
    return transfer;
  }

  async findById(id: string): Promise<BridgeTransfer | null> {
    return this.model.findOne({ id }).select('-_id -__v').lean().exec();
  }

  async get(id: string, includeSecrets = false): Promise<BridgeTransfer> {
    const query = this.model.findOne({ id });
    const selected =
      typeof (query as any).select === 'function'
        ? query.select(
            includeSecrets
              ? '+signedStellarXdr +signedEvmTx +leaseOwner +leaseExpiresAt'
              : '-_id -__v',
          )
        : query;
    const transfer = await selected.lean().exec();
    if (!transfer) throw new NotFoundException('Bridge transfer not found.');
    return transfer;
  }

  async findByIdempotencyKey(
    key: string,
    stellarAddress: string,
  ): Promise<BridgeTransfer | null> {
    return this.model
      .findOne({ idempotencyKey: key, stellarAddress })
      .select('-_id -__v')
      .lean()
      .exec();
  }

  async update(
    id: string,
    data: UpdateBridgeTransferData,
  ): Promise<BridgeTransfer> {
    const transfer = await this.model
      .findOneAndUpdate(
        { id },
        { $set: data },
        { new: true, runValidators: true },
      )
      .select('-_id -__v')
      .lean()
      .exec();
    if (!transfer) {
      throw new NotFoundException('Bridge transfer not found.');
    }
    return transfer;
  }

  async findActiveByEvmAddress(
    evmAddress: string,
  ): Promise<BridgeTransfer | null> {
    return this.model
      .findOne({
        evmAddress: getAddress(evmAddress),
        status: { $nin: [BridgeStatus.COMPLETED, BridgeStatus.FAILED] },
      })
      .sort({ createdAt: -1 })
      .select('-_id -__v')
      .lean()
      .exec();
  }

  async acquireLease(
    id: string,
    owner: string,
    ttlMs = 60_000,
  ): Promise<BridgeTransfer | null> {
    const now = new Date();
    return this.model
      .findOneAndUpdate(
        {
          id,
          status: { $nin: [BridgeStatus.COMPLETED, BridgeStatus.FAILED] },
          $or: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { $lte: now } },
            { leaseOwner: owner },
          ],
        },
        {
          $set: {
            leaseOwner: owner,
            leaseExpiresAt: new Date(now.getTime() + ttlMs),
          },
        },
        { new: true },
      )
      .select(
        '+signedStellarXdr +signedEvmTx +leaseOwner +leaseExpiresAt -_id -__v',
      )
      .lean()
      .exec();
  }

  async updateLeased(
    id: string,
    owner: string,
    data: UpdateBridgeTransferData,
  ): Promise<BridgeTransfer> {
    const transfer = await this.model
      .findOneAndUpdate(
        { id, leaseOwner: owner, leaseExpiresAt: { $gt: new Date() } },
        { $set: data, $inc: { revision: 1 } },
        { new: true, runValidators: true },
      )
      .select(
        '+signedStellarXdr +signedEvmTx +leaseOwner +leaseExpiresAt -_id -__v',
      )
      .lean()
      .exec();
    if (!transfer)
      throw new ConflictException('Bridge transfer lease expired.');
    return transfer;
  }

  async releaseLease(id: string, owner: string): Promise<void> {
    await this.model
      .updateOne(
        { id, leaseOwner: owner },
        { $set: { leaseOwner: null, leaseExpiresAt: null } },
      )
      .exec();
  }

  async save(transfer: BridgeTransfer): Promise<BridgeTransfer> {
    const revision = transfer.revision ?? 0;
    const next = { ...transfer, revision: revision + 1 };
    delete (next as any)._id;
    delete (next as any).__v;
    const query = this.model.findOneAndUpdate(
      { id: transfer.id, revision },
      { $set: next },
      { new: true, runValidators: true },
    );
    const selected =
      typeof (query as any).select === 'function'
        ? query.select('-_id -__v')
        : query;
    const saved = await selected.lean().exec();
    if (!saved)
      throw new ConflictException('Bridge transfer was updated concurrently.');
    return saved;
  }

  async findRecoverable(limit = 25): Promise<BridgeTransfer[]> {
    return this.model
      .find({
        direction: BridgeDirection.STELLAR_TO_EVM,
        status: {
          $in: [
            BridgeStatus.SOURCE_PENDING,
            BridgeStatus.ATTESTATION_PENDING,
            BridgeStatus.DESTINATION_PENDING,
          ],
        },
      })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .select('-_id -__v')
      .lean()
      .exec();
  }
}
