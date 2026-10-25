import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Wallet, getBytes, hashMessage } from 'ethers';
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { createHash } from 'crypto';
import { DeviceService } from '../device/device.service';
import { SigningService } from './signing.service';

describe('SigningService', () => {
  let service: SigningService;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign'>>;
  let deviceService: jest.Mocked<Pick<DeviceService, 'findOneByUniqueId'>>;
  const signingDeviceUniqueId = process.env.SIGNING_DEVICE_UNIQUE_ID;

  beforeEach(() => {
    process.env.SIGNING_DEVICE_UNIQUE_ID = 'web-device';
    jwtService = {
      sign: jest.fn().mockReturnValue('wallet-jwt'),
    };
    deviceService = {
      findOneByUniqueId: jest.fn().mockResolvedValue({ _id: 'device-id' }),
    };
    service = new SigningService(
      jwtService as unknown as JwtService,
      deviceService as unknown as DeviceService,
    );
  });

  afterAll(() => {
    if (signingDeviceUniqueId === undefined) {
      delete process.env.SIGNING_DEVICE_UNIQUE_ID;
    } else {
      process.env.SIGNING_DEVICE_UNIQUE_ID = signingDeviceUniqueId;
    }
  });

  function payload() {
    return `Sign:\nNonce: nonce-1\nExpires At: ${new Date(Date.now() + 60_000).toISOString()}`;
  }

  function signedManageDataXdr(
    signer: Keypair,
    message: string,
    overrides: {
      source?: string;
      value?: Buffer;
      operations?: ReturnType<typeof Operation.manageData>[];
      maxTime?: number;
    } = {},
  ) {
    const source = overrides.source ?? signer.publicKey();
    const value =
      overrides.value ?? createHash('sha256').update(message, 'utf8').digest();
    const operations = overrides.operations ?? [
      Operation.manageData({
        name: 'swift-ex-signing-request',
        value,
      }),
    ];
    const tx = new TransactionBuilder(new Account(source, '-1'), {
      fee: '100',
      networkPassphrase: Networks.PUBLIC,
      timebounds: {
        minTime: 0,
        maxTime: overrides.maxTime ?? Math.floor(Date.now() / 1000) + 60,
      },
    });
    operations.forEach((operation) => tx.addOperation(operation));
    const built = tx.build();
    built.sign(signer);
    return built.toXDR();
  }

  it('keeps EVM verification as the default signing chain', async () => {
    const wallet = Wallet.createRandom();
    const message = payload();
    const signature = wallet.signingKey.sign(
      getBytes(hashMessage(message)),
    ).serialized;

    await expect(
      service.verify({ payload: message, signature }),
    ).resolves.toEqual({ valid: true, jwt: 'wallet-jwt' });

    expect(jwtService.sign).toHaveBeenCalledWith({
      _id: 'device-id',
      walletAddress: wallet.address.toLowerCase(),
    });
  });

  it('verifies a Stellar payload signature and signs a JWT for that address', async () => {
    const signer = Keypair.random();
    const message = payload();
    const signature = signer
      .sign(Buffer.from(message, 'utf8'))
      .toString('base64');

    await expect(
      service.verify({
        chain: 'stellar',
        payload: message,
        signature,
        stellarAddress: signer.publicKey(),
      }),
    ).resolves.toEqual({ valid: true, jwt: 'wallet-jwt' });

    expect(jwtService.sign).toHaveBeenCalledWith({
      _id: 'device-id',
      walletAddress: signer.publicKey(),
    });
  });

  it('verifies a Stellar WalletConnect signed XDR and signs a JWT for that address', async () => {
    const signer = Keypair.random();
    const message = payload();
    const signedXdr = signedManageDataXdr(signer, message);

    await expect(
      service.verify({
        chain: 'stellar',
        payload: message,
        signedXdr,
        stellarAddress: signer.publicKey(),
      }),
    ).resolves.toEqual({ valid: true, jwt: 'wallet-jwt' });

    expect(jwtService.sign).toHaveBeenCalledWith({
      _id: 'device-id',
      walletAddress: signer.publicKey(),
    });
  });

  it('rejects a Stellar WalletConnect signed XDR when the payload hash is tampered', async () => {
    const signer = Keypair.random();
    const message = payload();
    const signedXdr = signedManageDataXdr(signer, message, {
      value: Buffer.alloc(32, 1),
    });

    await expect(
      service.verify({
        chain: 'stellar',
        payload: message,
        signedXdr,
        stellarAddress: signer.publicKey(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a Stellar WalletConnect signed XDR with the wrong operation type', async () => {
    const signer = Keypair.random();
    const message = payload();
    const signedXdr = signedManageDataXdr(signer, message, {
      operations: [
        Operation.payment({
          destination: signer.publicKey(),
          asset: Asset.native(),
          amount: '1',
        }),
      ],
    });

    await expect(
      service.verify({
        chain: 'stellar',
        payload: message,
        signedXdr,
        stellarAddress: signer.publicKey(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a Stellar WalletConnect signed XDR with multiple operations', async () => {
    const signer = Keypair.random();
    const message = payload();
    const value = createHash('sha256').update(message, 'utf8').digest();
    const signedXdr = signedManageDataXdr(signer, message, {
      operations: [
        Operation.manageData({
          name: 'swift-ex-signing-request',
          value,
        }),
        Operation.manageData({
          name: 'swift-ex-signing-request-2',
          value,
        }),
      ],
    });

    await expect(
      service.verify({
        chain: 'stellar',
        payload: message,
        signedXdr,
        stellarAddress: signer.publicKey(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired Stellar WalletConnect signed XDR', async () => {
    const signer = Keypair.random();
    const message = payload();
    const signedXdr = signedManageDataXdr(signer, message, {
      maxTime: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(
      service.verify({
        chain: 'stellar',
        payload: message,
        signedXdr,
        stellarAddress: signer.publicKey(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a Stellar request with an invalid public key', async () => {
    const signer = Keypair.random();
    const message = payload();
    const signature = signer
      .sign(Buffer.from(message, 'utf8'))
      .toString('base64');

    await expect(
      service.verify({
        chain: 'stellar',
        payload: message,
        signature,
        stellarAddress: 'not-a-stellar-address',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a Stellar request without a raw signature or signed XDR', async () => {
    const signer = Keypair.random();

    await expect(
      service.verify({
        chain: 'stellar',
        payload: payload(),
        stellarAddress: signer.publicKey(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a Stellar signature that was not produced by the claimed address', async () => {
    const signer = Keypair.random();
    const otherSigner = Keypair.random();
    const message = payload();
    const signature = signer
      .sign(Buffer.from(message, 'utf8'))
      .toString('base64');

    await expect(
      service.verify({
        chain: 'stellar',
        payload: message,
        signature,
        stellarAddress: otherSigner.publicKey(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
