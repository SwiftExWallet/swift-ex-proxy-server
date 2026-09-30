import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  scValToNative,
} from '@stellar/stellar-sdk';
import {
  extractMessageEventBytes,
  normalizeDepositEventData,
  StellarService,
} from './stellar.service';

const user = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const messenger = StrKey.encodeContract(Buffer.alloc(32, 2));
const config = new ConfigService({
  blockchain: {
    stellar: {
      network: 'testnet',
      usdcIssuer: user.publicKey(),
      tokenMessengerAddress: messenger,
      messageTransmitterAddress: StrKey.encodeContract(Buffer.alloc(32, 3)),
      treasuryAddress: user.publicKey(),
    },
  },
});
describe('Stellar burn construction', () => {
  const service = new StellarService(config);
  beforeEach(() => {
    Object.defineProperty(service, 'rpc', {
      configurable: true,
      value: {
        getAccount: jest
          .fn()
          .mockResolvedValue(new Account(user.publicKey(), '1')),
        prepareTransaction: jest.fn((tx) => Promise.resolve(tx)),
        getNetwork: jest
          .fn()
          .mockResolvedValue({ passphrase: Networks.TESTNET }),
      },
    });
  });

  it('normalizes Soroban event maps by field name, not sorted map order', () => {
    const recipient = Buffer.alloc(32, 4);
    const values = new Map<string, unknown>([
      ['amount', 9950000n],
      ['destination_caller', Buffer.alloc(32)],
      ['destination_domain', 0],
      ['destination_token_messenger', Buffer.alloc(32, 5)],
      ['hook_data', Buffer.alloc(0)],
      ['max_fee', 1n],
      ['mint_recipient', recipient],
    ]);
    expect(normalizeDepositEventData(values)).toEqual([
      9950000n,
      recipient,
      0,
      Buffer.alloc(32, 5),
      Buffer.alloc(32),
      1n,
      Buffer.alloc(0),
    ]);
  });
  it('encodes caller, seven-decimal burn/max fee, EVM bytes32 recipient and standard finality', async () => {
    const xdr = await service.buildBurnTransaction(
      user.publicKey(),
      '0x' + '44'.repeat(20),
      1492500n,
      0,
      100n,
    );
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as any;
    expect(tx.operations).toHaveLength(1);
    const invocation = tx.operations[0].func.invokeContract();
    expect(invocation.functionName().toString()).toBe('deposit_for_burn');
    const args = invocation.args().map(scValToNative);
    expect(args).toEqual([
      user.publicKey(),
      14925000n,
      0,
      Buffer.from('00'.repeat(12) + '44'.repeat(20), 'hex'),
      new Asset('USDC', user.publicKey()).contractId(Networks.TESTNET),
      Buffer.alloc(32),
      1000n,
      2000,
    ]);
  });
  it('does not treat an unsuccessful transaction as a verified burn', () => {
    expect(() =>
      service.verifyBurnEvents({ status: 'FAILED' } as any, {} as any),
    ).toThrow();
    expect(() =>
      service.verifyBurnEvents(
        { status: 'SUCCESS', events: { contractEventsXdr: [] } } as any,
        {} as any,
      ),
    ).toThrow();
  });

  it('extracts the bytes from the message_sent event tuple', () => {
    const message = Buffer.from('abcd', 'hex');
    expect(extractMessageEventBytes([message])).toEqual(message);
    expect(extractMessageEventBytes(message)).toEqual(message);
    expect(extractMessageEventBytes(new Map([['message', [message]]]))).toEqual(
      message,
    );
    expect(extractMessageEventBytes([])).toBeNull();
  });

  it('rejects a Stellar RPC connected to the wrong network', async () => {
    (service.rpc.getNetwork as jest.Mock).mockResolvedValue({
      passphrase: Networks.PUBLIC,
    });

    await expect(
      service.buildBurnTransaction(
        user.publicKey(),
        '0x' + '44'.repeat(20),
        1492500n,
        0,
        100n,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
