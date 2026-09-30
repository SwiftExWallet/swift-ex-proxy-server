import { ConfigService } from '@nestjs/config';
import {
  Account,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';
import blockchainConfig from '../config/blockchain.config';

const signer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
const forwarder = StrKey.encodeContract(Buffer.alloc(32, 2));
const config = new ConfigService({
  blockchain: {
    stellar: {
      horizonUrl: 'https://horizon-testnet.stellar.org',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      forwarderAddress: forwarder,
      usdcIssuer: signer.publicKey(),
      network: 'testnet',
    },
  },
});

describe('Bridge Stellar signing', () => {
  it.each(['testnet', 'mainnet', 'public'])(
    'loads %s from STELLAR_NETWORK',
    (network) => {
      const previous = process.env.STELLAR_NETWORK;
      try {
        process.env.STELLAR_NETWORK = network;
        const configured = new StellarService(
          new ConfigService({ blockchain: blockchainConfig() }),
        );
        expect(configured.network).toBe(
          network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC,
        );
      } finally {
        if (previous === undefined) delete process.env.STELLAR_NETWORK;
        else process.env.STELLAR_NETWORK = previous;
      }
    },
  );
  it.each([Networks.TESTNET, Networks.PUBLIC])(
    'verifies signatures only for configured network %s',
    (network) => {
      const configured = new StellarService(
        new ConfigService({ blockchain: { stellar: { network } } }),
      );
      const tx = new TransactionBuilder(new Account(signer.publicKey(), '1'), {
        fee: '100',
        networkPassphrase: network,
      })
        .addOperation(
          Operation.manageData({ name: 'fixture', value: 'bridge' }),
        )
        .setTimeout(300)
        .build();
      const unsigned = tx.toXDR();
      tx.sign(signer);
      expect(
        configured
          .verifySignedXdr(unsigned, tx.toXDR(), signer.publicKey())
          .hash(),
      ).toEqual(tx.hash());
      const otherNetwork = TransactionBuilder.fromXDR(
        unsigned,
        network === Networks.TESTNET ? Networks.PUBLIC : Networks.TESTNET,
      );
      otherNetwork.sign(signer);
      expect(() =>
        configured.verifySignedXdr(
          unsigned,
          otherNetwork.toXDR(),
          signer.publicKey(),
        ),
      ).toThrow('Expected Stellar wallet did not sign transaction');
    },
  );
  const service = new StellarService(config);
  function transaction(sequence = '1') {
    return new TransactionBuilder(new Account(signer.publicKey(), sequence), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.manageData({ name: 'fixture', value: 'bridge' }))
      .setTimeout(300)
      .build();
  }
  it('encodes the recipient as a strkey following the 32-byte forwarder header', () => {
    const hook = Buffer.from(
      (service as any).buildHook(signer.publicKey()).slice(2),
      'hex',
    );
    expect(hook.subarray(0, 28)).toEqual(Buffer.alloc(28));
    expect(hook.readUInt32BE(28)).toBe(56);
    expect(hook.subarray(32).toString()).toBe(signer.publicKey());
    expect((service as any).forwarderBytes32()).toBe('0x' + '02'.repeat(32));
  });
  it('accepts only the prepared transaction signed by the intended account', () => {
    const tx = transaction();
    const unsigned = tx.toXDR();
    tx.sign(signer);
    expect(
      (service as any)
        .verifySignedXdr(unsigned, tx.toXDR(), signer.publicKey())
        .hash()
        .toString('hex'),
    ).toBe(tx.hash().toString('hex'));
    const changed = transaction('2');
    changed.sign(signer);
    expect(() =>
      (service as any).verifySignedXdr(
        unsigned,
        changed.toXDR(),
        signer.publicKey(),
      ),
    ).toThrow();
  });
  it('rejects unsigned and incorrectly signed envelopes', () => {
    const tx = transaction();
    const unsigned = tx.toXDR();
    expect(() =>
      (service as any).verifySignedXdr(unsigned, unsigned, signer.publicKey()),
    ).toThrow();
    tx.sign(Keypair.random());
    expect(() =>
      (service as any).verifySignedXdr(
        unsigned,
        tx.toXDR(),
        signer.publicKey(),
      ),
    ).toThrow();
  });
});
