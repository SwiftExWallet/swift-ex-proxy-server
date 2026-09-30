import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { BridgeTransfer } from '../types/bridge-transfer.type';
import { BridgeRepository } from './bridge.repository';
import { BridgeStatus } from '../types/bridge-status.type';
import { EvmSourceChain } from '../evm/evm-source-chain';
import { BridgeTransferSchema } from '../schema/bridge-transfer.schema';
import { CreateBridgeTransferData } from './bridge.repository';

describe('BridgeRepository current persistence API', () => {
  const data: CreateBridgeTransferData = {
    sourceChain: EvmSourceChain.BASE_SEPOLIA,
    sourceChainId: 84532,
    sourceRouterAddress: '0xE71C29FeD584Ca10668b7f13fB1F3bE28bD8F639',
    evmAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    stellarAddress: 'stellar-recipient',
    amount: '1',
    amountRaw: '1000000',
    fast: false,
    feeBps: '25',
    maxFee: '120',
    minimumReceived: '0.99738',
    status: BridgeStatus.CREATED,
  };
  const transfer = {
    ...data,
    id: 'transfer-id',
    createdAt: new Date('2026-09-21T00:00:00Z'),
    updatedAt: new Date('2026-09-21T00:00:00Z'),
  };
  const query = (value: unknown) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });
  let model: {
    create: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let repository: BridgeRepository;

  beforeEach(() => {
    model = {
      create: jest.fn().mockResolvedValue({
        toObject: () => ({ ...transfer, _id: 'mongo-id', __v: 0 }),
      }),
      findOne: jest.fn().mockReturnValue(query(transfer)),
      findOneAndUpdate: jest.fn().mockReturnValue(query(transfer)),
    };
    repository = new BridgeRepository(
      model as unknown as Model<BridgeTransfer>,
    );
  });

  it('persists the quote and returns a plain transfer with its public id', async () => {
    const result = await repository.create(data);
    expect(model.create).toHaveBeenCalledWith(data);
    expect(result).toEqual(transfer);
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('__v');
  });

  it('defines optional source-chain snapshot paths for restart recovery', () => {
    expect(BridgeTransferSchema.path('sourceChain')).toBeDefined();
    expect(BridgeTransferSchema.path('sourceChainId')).toBeDefined();
    expect(BridgeTransferSchema.path('sourceRouterAddress')).toBeDefined();
  });

  it('loads by public id and returns null for an unknown transfer', async () => {
    expect(await repository.findById('transfer-id')).toEqual(transfer);
    expect(model.findOne).toHaveBeenCalledWith({ id: 'transfer-id' });
    model.findOne.mockReturnValue(query(null));
    expect(await repository.findById('missing')).toBeNull();
  });

  it('atomically patches recovery fields and returns the updated transfer', async () => {
    const patch = {
      status: BridgeStatus.ATTESTATION_PENDING,
      sourceTxHash: '0xsource',
      stellarUnsignedXdr: null,
    };
    model.findOneAndUpdate.mockReturnValue(query({ ...transfer, ...patch }));
    expect(await repository.update('transfer-id', patch)).toEqual({
      ...transfer,
      ...patch,
    });
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'transfer-id' },
      { $set: patch },
      { new: true, runValidators: true },
    );
  });

  it('does not create a transfer when updating an unknown id', async () => {
    model.findOneAndUpdate.mockReturnValue(query(null));
    await expect(
      repository.update('missing', { status: BridgeStatus.FAILED }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('finds the latest non-terminal transfer regardless of address casing', async () => {
    const lookup = query(transfer);
    model.findOne.mockReturnValue(lookup);
    expect(
      await repository.findActiveByEvmAddress(data.evmAddress.toLowerCase()),
    ).toEqual(transfer);
    expect(model.findOne).toHaveBeenCalledWith({
      evmAddress: data.evmAddress,
      status: { $nin: [BridgeStatus.COMPLETED, BridgeStatus.FAILED] },
    });
    expect(lookup.sort).toHaveBeenCalledWith({ createdAt: -1 });
    model.findOne.mockReturnValue(query(null));
    expect(await repository.findActiveByEvmAddress(data.evmAddress)).toBeNull();
  });

  it('propagates database failures instead of returning an unpersisted transfer', async () => {
    model.create.mockRejectedValue(new Error('database unavailable'));
    await expect(repository.create(data)).rejects.toThrow(
      'database unavailable',
    );
  });
});
