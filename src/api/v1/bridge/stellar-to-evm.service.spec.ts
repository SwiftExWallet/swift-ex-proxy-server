import { ConflictException } from '@nestjs/common';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { StellarToEvmService } from './stellar-to-evm.service';
import { BridgeDirection } from './types/bridge-direction.type';
import { BridgeStatus } from './types/bridge-status.type';

const stellarAddress = Keypair.fromRawEd25519Seed(
  Buffer.alloc(32, 7),
).publicKey();
const tokenMessenger = StrKey.encodeContract(Buffer.alloc(32, 2));
const messageTransmitter = StrKey.encodeContract(Buffer.alloc(32, 3));
const usdc = StrKey.encodeContract(Buffer.alloc(32, 4));
const evmAddress = '0x4444444444444444444444444444444444444444';
const evmMessenger = '0x2222222222222222222222222222222222222222';

function message(expected: any): string {
  const bytes = Buffer.alloc(376);
  bytes.writeUInt32BE(1, 0);
  bytes.writeUInt32BE(27, 4);
  bytes.writeUInt32BE(expected.destinationDomain, 8);
  bytes.fill(9, 12, 44);
  for (const [field, offset] of [
    ['sender', 44],
    ['recipient', 76],
    ['burnToken', 152],
    ['mintRecipient', 184],
    ['messageSender', 248],
  ] as const)
    Buffer.from(expected[field].slice(2), 'hex').copy(bytes, offset);
  bytes.writeUInt32BE(2000, 140);
  bytes.writeUInt32BE(2000, 144);
  bytes.writeUInt32BE(1, 148);
  bytes.writeBigUInt64BE(expected.amount, 240);
  bytes.writeBigUInt64BE(expected.maxFee, 304);
  return `0x${bytes.toString('hex')}`;
}

describe('StellarToEvmService recovery', () => {
  let current: any;
  let repository: any;
  let stellar: any;
  let evm: any;
  let circle: any;
  let service: StellarToEvmService;

  beforeEach(() => {
    current = {
      id: 'transfer',
      direction: BridgeDirection.STELLAR_TO_EVM,
      evmAddress,
      stellarAddress,
      amount: '1.5',
      amountRaw: '1500000',
      netAmountRaw: '1492500',
      protocolFeeRaw: '7500',
      feeBps: '50',
      maxFee: '100',
      minimumReceived: '1.4924',
      fast: false,
      sourceDomain: 27,
      destinationDomain: 0,
      sourceTokenMessenger: tokenMessenger,
      destinationTokenMessenger: evmMessenger,
      sourceMessageTransmitter: messageTransmitter,
      destinationMessageTransmitter:
        '0x3333333333333333333333333333333333333333',
      sourceUsdcAddress: usdc,
      destinationUsdcAddress: '0x1111111111111111111111111111111111111111',
      status: BridgeStatus.ATTESTATION_PENDING,
      sourceTxHash: 'ab'.repeat(32),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repository = {
      get: jest.fn(() => Promise.resolve(structuredClone(current))),
      acquireLease: jest.fn((_id, owner) =>
        Promise.resolve({
          ...structuredClone(current),
          leaseOwner: owner,
        }),
      ),
      releaseLease: jest.fn().mockResolvedValue(undefined),
      updateLeased: jest.fn((_id, _owner, patch) => {
        current = { ...current, ...patch };
        return Promise.resolve(structuredClone(current));
      }),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findRecoverable: jest.fn().mockResolvedValue([]),
    };
    stellar = {
      getTransaction: jest.fn(),
      broadcast: jest.fn(),
      verifyBurnEvents: jest.fn(),
      verifySignedXdr: jest.fn(),
    };
    evm = {
      prepareMint: jest.fn(),
      isMessageReceived: jest.fn().mockResolvedValue(false),
      receipt: jest.fn(),
      broadcast: jest.fn(),
      verifyMint: jest.fn(),
    };
    circle = { getStellarAttestation: jest.fn() };
    service = new StellarToEvmService(repository, stellar, evm, circle);
  });

  it('resumes a confirmed burn after restart without constructing another burn', async () => {
    current.status = BridgeStatus.SOURCE_PENDING;
    current.signedStellarXdr = 'signed-burn';
    stellar.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
    stellar.verifyBurnEvents.mockReturnValue({ message: '0xsource-message' });
    await expect(service.status('transfer')).resolves.toMatchObject({
      status: BridgeStatus.ATTESTATION_PENDING,
      message: '0xsource-message',
    });
    expect(stellar.broadcast).not.toHaveBeenCalled();
    expect(current.signedStellarXdr).toBeNull();
  });

  it('keeps attestation timeout pending for a later retry', async () => {
    circle.getStellarAttestation.mockResolvedValue(null);
    await expect(service.status('transfer')).resolves.toMatchObject({
      status: BridgeStatus.ATTESTATION_PENDING,
    });
    expect(evm.prepareMint).not.toHaveBeenCalled();
  });

  it('completes without a new mint when the CCTP nonce is already consumed', async () => {
    const expected = (service as any).expectedBurn(current);
    circle.getStellarAttestation.mockResolvedValue({
      message: message(expected),
      attestation: '0xattestation',
    });
    evm.prepareMint.mockResolvedValue(null);
    await expect(service.status('transfer')).resolves.toMatchObject({
      status: BridgeStatus.COMPLETED,
    });
    expect(current.activeStellarKey).toBeNull();
  });

  it('persists the attestation checkpoint when mint simulation fails', async () => {
    const expected = (service as any).expectedBurn(current);
    circle.getStellarAttestation.mockResolvedValue({
      message: message(expected),
      attestation: '0xattestation',
    });
    evm.prepareMint.mockRejectedValue(new Error('simulation reverted'));
    await expect(service.status('transfer')).rejects.toThrow(
      'simulation reverted',
    );
    expect(current).toMatchObject({
      status: BridgeStatus.ATTESTATION_PENDING,
      attestation: '0xattestation',
    });
  });

  it('completes destination recovery after the nonce is consumed', async () => {
    current.status = BridgeStatus.DESTINATION_PENDING;
    current.messageNonce = '0x' + '09'.repeat(32);
    current.destinationTxHash = '0xmint';
    evm.isMessageReceived.mockResolvedValue(true);
    await expect(service.status('transfer')).resolves.toMatchObject({
      status: BridgeStatus.COMPLETED,
      destinationTxHash: '0xmint',
    });
    expect(evm.broadcast).not.toHaveBeenCalled();
  });

  it('persists the burn hash and signed bytes before broadcasting', async () => {
    current.status = BridgeStatus.BURN_SIGNATURE_REQUIRED;
    current.stellarUnsignedXdr = 'unsigned-burn';
    stellar.verifySignedXdr.mockReturnValue({
      hash: () => Buffer.alloc(32, 8),
    });
    stellar.broadcast.mockImplementation(() => {
      expect(current.status).toBe(BridgeStatus.SOURCE_PENDING);
      expect(current.sourceTxHash).toBe('08'.repeat(32));
      expect(current.signedStellarXdr).toBe('signed-burn');
      return Promise.resolve({ status: 'PENDING' });
    });
    await expect(
      service.submitStellarSignature('transfer', 'signed-burn'),
    ).resolves.toMatchObject({
      status: BridgeStatus.SOURCE_PENDING,
      sourceTxHash: '08'.repeat(32),
    });
  });

  it('does not advance when another worker owns the lease', async () => {
    repository.acquireLease.mockResolvedValue(null);
    circle.getStellarAttestation.mockResolvedValue(null);
    await service.status('transfer');
    expect(circle.getStellarAttestation).not.toHaveBeenCalled();
  });

  it('reuses a matching wallet-scoped idempotency key and returns its signing request', async () => {
    current.status = BridgeStatus.BURN_SIGNATURE_REQUIRED;
    current.idempotencyKey = 'request-123';
    current.stellarUnsignedXdr = 'unsigned-burn';
    repository.findByIdempotencyKey.mockResolvedValue(current);

    await expect(
      service.create({
        direction: BridgeDirection.STELLAR_TO_EVM,
        idempotencyKey: 'request-123',
        stellarAddress,
        evmAddress,
        amount: '1.5',
        fast: false,
      }),
    ).resolves.toMatchObject({
      status: BridgeStatus.BURN_SIGNATURE_REQUIRED,
      signingRequest: { type: 'STELLAR', purpose: 'BURN' },
    });
    expect(repository.findByIdempotencyKey).toHaveBeenCalledWith(
      'request-123',
      stellarAddress,
    );
  });

  it('rejects reuse of an idempotency key with a different request', async () => {
    current.idempotencyKey = 'request-123';
    repository.findByIdempotencyKey.mockResolvedValue(current);

    await expect(
      service.create({
        direction: BridgeDirection.STELLAR_TO_EVM,
        idempotencyKey: 'request-123',
        stellarAddress,
        evmAddress,
        amount: '2',
        fast: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
