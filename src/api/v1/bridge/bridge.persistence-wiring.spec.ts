import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { model } from 'mongoose';
import { BridgeModule } from './bridge.module';
import { BridgeRepository } from './repositories/bridge.repository';
import { BridgeService } from './bridge.service';
import { EvmService } from './evm/evm.service';
import { StellarService } from './stellar/stellar.service';
import { CircleService } from './circle/circle.service';
import { BridgeTransferSchema } from './schema/bridge-transfer.schema';
import { BridgeStatus } from './types/bridge-status.type';

describe('Bridge persistence wiring', () => {
  const transferModel = model('BridgePersistenceTest', BridgeTransferSchema);
  const data = {
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

  it('generates distinct public ids and retains persisted recovery data', async () => {
    const first = new transferModel({
      ...data,
      sourceTxHash: '0xsource',
      destinationTxHash: 'destination',
      message: 'message',
      attestation: 'attestation',
      stellarUnsignedXdr: 'unsigned-xdr',
      error: 'failure reason',
    });
    await first.validate();
    expect(first.id).toEqual(expect.any(String));
    expect(first.id).not.toBe(new transferModel(data).id);
    expect(first.toObject()).toMatchObject({
      ...data,
      sourceTxHash: '0xsource',
      destinationTxHash: 'destination',
      message: 'message',
      attestation: 'attestation',
      stellarUnsignedXdr: 'unsigned-xdr',
      error: 'failure reason',
    });
    await expect(
      new transferModel({ ...data, status: 'INVALID' }).validate(),
    ).rejects.toThrow();
  });

  it('resolves the repository model through BridgeModule registration', async () => {
    const connection = {
      models: {},
      model: jest.fn().mockReturnValue(transferModel),
    };
    const module = await Test.createTestingModule({ imports: [BridgeModule] })
      .useMocker((token) =>
        token === getConnectionToken() ? connection : undefined,
      )
      .overrideProvider(EvmService)
      .useValue({})
      .overrideProvider(StellarService)
      .useValue({})
      .overrideProvider(CircleService)
      .useValue({})
      .compile();
    try {
      expect(module.get(BridgeRepository)).toBeInstanceOf(BridgeRepository);
      expect(module.get(BridgeService)).toBeInstanceOf(BridgeService);
      expect(connection.model).toHaveBeenCalledWith(
        'BridgeTransfer',
        BridgeTransferSchema,
        undefined,
      );
    } finally {
      await module.close();
    }
  });
});
