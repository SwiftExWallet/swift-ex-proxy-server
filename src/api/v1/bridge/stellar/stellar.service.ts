import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { bridgeConfig } from '../bridge-config';
import { Buffer } from 'buffer';
import { parseUnits } from 'ethers';
import { ExpectedBurn, validateBurnMessage } from '../circle/cctp-message';

export function extractMessageEventBytes(data: unknown): Buffer | null {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (Array.isArray(data)) {
    for (const value of data) {
      const bytes = extractMessageEventBytes(value);
      if (bytes) return bytes;
    }
    return null;
  }
  if (data instanceof Map) {
    for (const value of data.values()) {
      const bytes = extractMessageEventBytes(value);
      if (bytes) return bytes;
    }
    return null;
  }
  if (data && typeof data === 'object') {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const bytes = extractMessageEventBytes(value);
      if (bytes) return bytes;
    }
  }
  return null;
}

export function normalizeDepositEventData(raw: unknown): unknown[] {
  if (raw instanceof Map) {
    const values = new Map<string, unknown>();
    for (const [key, value] of raw.entries()) values.set(String(key), value);
    const get = (snake: string, camel: string) =>
      values.get(snake) ?? values.get(camel);
    return [
      get('amount', 'amount'),
      get('mint_recipient', 'mintRecipient'),
      get('destination_domain', 'destinationDomain'),
      get('destination_token_messenger', 'destinationTokenMessenger'),
      get('destination_caller', 'destinationCaller'),
      get('max_fee', 'maxFee'),
      get('hook_data', 'hookData'),
    ];
  }
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    return [
      record.amount,
      record.mint_recipient ?? record.mintRecipient,
      record.destination_domain ?? record.destinationDomain,
      record.destination_token_messenger ?? record.destinationTokenMessenger,
      record.destination_caller ?? record.destinationCaller,
      record.max_fee ?? record.maxFee,
      record.hook_data ?? record.hookData,
    ];
  }
  return [];
}

@Injectable()
export class StellarService {
  private rpcServer?: StellarSdk.rpc.Server;
  private horizonServer?: StellarSdk.Horizon.Server;
  constructor(private readonly config: ConfigService) {}

  get rpc(): StellarSdk.rpc.Server {
    return (this.rpcServer ??= new StellarSdk.rpc.Server(
      bridgeConfig<string>(this.config, 'stellar.rpcUrl'),
      { timeout: 15000 },
    ));
  }
  get horizon(): StellarSdk.Horizon.Server {
    return (this.horizonServer ??= new StellarSdk.Horizon.Server(
      bridgeConfig<string>(this.config, 'stellar.horizonUrl'),
    ));
  }
  get forwarderAddress(): string {
    const address = bridgeConfig<string>(
      this.config,
      'stellar.forwarderAddress',
    );
    if (!StellarSdk.StrKey.isValidContract(address))
      throw new ServiceUnavailableException(
        'Invalid Stellar forwarder address',
      );
    return address;
  }

  isBackendMintRelayerEnabled(): boolean {
    return process.env.STELLAR_MINT_MODE === 'backend_relayer';
  }

  private getRelayerKeypair(): StellarSdk.Keypair {
    const secret = process.env.STELLAR_RELAYER_SECRET_KEY;
    if (!secret) {
      throw new ServiceUnavailableException(
        'Stellar backend relayer secret is not configured',
      );
    }
    let keypair: StellarSdk.Keypair;
    try {
      keypair = StellarSdk.Keypair.fromSecret(secret);
    } catch {
      throw new ServiceUnavailableException(
        'Stellar backend relayer secret is invalid',
      );
    }
    const publicKey = process.env.STELLAR_RELAYER_PUBLIC_KEY?.trim();
    if (publicKey && publicKey !== keypair.publicKey()) {
      throw new ServiceUnavailableException(
        'Stellar backend relayer public key does not match the secret',
      );
    }
    return keypair;
  }
  get usdcIssuer(): string {
    return bridgeConfig<string>(this.config, 'stellar.usdcIssuer');
  }
  get tokenMessengerAddress(): string {
    return this.contractAddress('tokenMessengerAddress');
  }
  get messageTransmitterAddress(): string {
    return this.contractAddress('messageTransmitterAddress');
  }
  get treasuryAddress(): string {
    const address = bridgeConfig<string>(
      this.config,
      'stellar.treasuryAddress',
    );
    this.validateAddress(address);
    return address;
  }
  get usdcContractAddress(): string {
    return new StellarSdk.Asset('USDC', this.usdcIssuer).contractId(
      this.network,
    );
  }
  private contractAddress(key: string): string {
    const address = bridgeConfig<string>(this.config, `stellar.${key}`);
    if (!StellarSdk.StrKey.isValidContract(address)) {
      throw new ServiceUnavailableException(`Invalid Stellar ${key}`);
    }
    return address;
  }
  get network(): string {
    const network = bridgeConfig<string>(this.config, 'stellar.network');
    if (
      network === 'testnet' ||
      network === String(StellarSdk.Networks.TESTNET)
    )
      return StellarSdk.Networks.TESTNET;
    if (
      network === 'public' ||
      network === 'mainnet' ||
      network === String(StellarSdk.Networks.PUBLIC)
    )
      return StellarSdk.Networks.PUBLIC;
    throw new ServiceUnavailableException('Unsupported bridge Stellar network');
  }

  validateAddress(address: string) {
    // The recipient also pays for and signs the mint; only classic accounts are supported.
    if (
      typeof address !== 'string' ||
      !StellarSdk.StrKey.isValidEd25519PublicKey(address)
    ) {
      throw new BadRequestException('A valid Stellar G account is required');
    }
  }

  async validateRecipient(address: string) {
    this.validateAddress(address);
    const account = await this.horizon.loadAccount(address);
    const trustline = account.balances.find(
      (balance) =>
        'asset_code' in balance &&
        balance.asset_code === 'USDC' &&
        balance.asset_issuer === this.usdcIssuer,
    );
    if (
      !trustline ||
      ('is_authorized' in trustline && trustline.is_authorized === false)
    ) {
      throw new BadRequestException(
        'Stellar recipient needs an authorized USDC trustline',
      );
    }
  }

  buildHook(address: string): string {
    this.validateAddress(address);
    const recipient = Buffer.from(address, 'utf8');
    const hook = Buffer.alloc(32 + recipient.length);

    hook.writeUInt32BE(recipient.length, 28);
    recipient.copy(hook, 32);
    return `0x${hook.toString('hex')}`;
  }

  forwarderBytes32(): string {
    return `0x${StellarSdk.StrKey.decodeContract(this.forwarderAddress).toString('hex')}`;
  }

  async buildMintTransaction(
    address: string,
    message: string,
    attestation: string,
  ): Promise<string> {
    this.validateAddress(address);
    const account = await this.rpc.getAccount(address);
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.network,
    })
      .addOperation(
        new StellarSdk.Contract(this.forwarderAddress).call(
          'mint_and_forward',
          StellarSdk.xdr.ScVal.scvBytes(Buffer.from(message.slice(2), 'hex')),
          StellarSdk.xdr.ScVal.scvBytes(
            Buffer.from(attestation.slice(2), 'hex'),
          ),
        ),
      )
      .setTimeout(300)
      .build();
    const prepared = await this.rpc.prepareTransaction(tx);
    return prepared.toXDR();
  }

  async submitRelayerMint(
    message: string,
    attestation: string,
  ): Promise<{ hash: string }> {
    const keypair = this.getRelayerKeypair();
    const unsignedXdr = await this.buildMintTransaction(
      keypair.publicKey(),
      message,
      attestation,
    );
    const transaction = this.parse(unsignedXdr);
    transaction.sign(keypair);
    const response = await this.broadcast(transaction.toXDR());
    if (response.status === 'ERROR') {
      throw new BadGatewayException('Stellar relayer mint transaction failed');
    }
    return { hash: Buffer.from(transaction.hash()).toString('hex') };
  }

  async buildApprovalTransaction(
    address: string,
    amount: bigint,
  ): Promise<string> {
    this.validateAddress(address);
    if (amount <= 0n)
      throw new BadRequestException('Invalid Stellar approval amount');
    const [account, latest] = await Promise.all([
      this.rpc.getAccount(address),
      this.rpc.getLatestLedger(),
    ]);
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.network,
    })
      .addOperation(
        new StellarSdk.Contract(this.usdcContractAddress).call(
          'approve',
          StellarSdk.nativeToScVal(address, { type: 'address' }),
          StellarSdk.nativeToScVal(this.tokenMessengerAddress, {
            type: 'address',
          }),
          StellarSdk.nativeToScVal(amount * 10n, { type: 'i128' }),
          StellarSdk.nativeToScVal(Number(latest.sequence) + 10000, {
            type: 'u32',
          }),
        ),
      )
      .setTimeout(300)
      .build();
    return (await this.rpc.prepareTransaction(tx)).toXDR();
  }

  async balanceRaw(address: string): Promise<bigint> {
    this.validateAddress(address);
    const account = await this.horizon.loadAccount(address);
    const balance = account.balances.find(
      (row) =>
        'asset_code' in row &&
        row.asset_code === 'USDC' &&
        row.asset_issuer === this.usdcIssuer,
    );
    if (
      !balance ||
      ('is_authorized' in balance && balance.is_authorized === false)
    )
      return 0n;
    return parseUnits(balance.balance, 7);
  }

  async buildBurnTransaction(
    address: string,
    evmRecipient: string,
    amount: bigint,
    protocolFee: bigint | number,
    maxFee: bigint,
    destinationDomain = 0,
  ): Promise<string> {
    this.validateAddress(address);
    if (!/^0x[0-9a-fA-F]{40}$/.test(evmRecipient)) {
      throw new BadRequestException(
        'A valid destination EVM address is required',
      );
    }
    const protocolFeeRaw = BigInt(protocolFee);
    if (
      amount <= 0n ||
      protocolFeeRaw < 0n ||
      maxFee < 0n ||
      maxFee >= amount
    ) {
      throw new BadRequestException('Invalid Stellar bridge amounts');
    }
    const localAmount = amount * 10n;
    const localFee = protocolFeeRaw * 10n;
    const localMaxFee = maxFee * 10n;
    const source = StellarSdk.nativeToScVal(address, { type: 'address' });
    const [account, network] = await Promise.all([
      this.rpc.getAccount(address),
      this.rpc.getNetwork(),
    ]);
    if (network.passphrase !== this.network) {
      throw new ServiceUnavailableException(
        'Stellar RPC network does not match bridge configuration',
      );
    }

    const builder = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.network,
    }).addOperation(
      new StellarSdk.Contract(this.tokenMessengerAddress).call(
        'deposit_for_burn',
        source,
        StellarSdk.nativeToScVal(localAmount, { type: 'i128' }),
        StellarSdk.nativeToScVal(destinationDomain, { type: 'u32' }),
        StellarSdk.xdr.ScVal.scvBytes(
          Buffer.from(
            `000000000000000000000000${evmRecipient.slice(2)}`,
            'hex',
          ),
        ),
        StellarSdk.nativeToScVal(this.usdcContractAddress, { type: 'address' }),
        StellarSdk.xdr.ScVal.scvBytes(Buffer.alloc(32)),
        StellarSdk.nativeToScVal(localMaxFee, { type: 'i128' }),
        StellarSdk.nativeToScVal(2000, { type: 'u32' }),
      ),
    );
    const transaction = builder.setTimeout(300).build();
    return (await this.rpc.prepareTransaction(transaction)).toXDR();
  }

  verifyBurnEvents(
    result: StellarSdk.rpc.Api.GetTransactionResponse,
    expected: ExpectedBurn,
  ): { message: string } {
    if (
      result.status !== StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS ||
      !('events' in result)
    ) {
      throw new BadGatewayException('Stellar burn transaction did not succeed');
    }
    const events = StellarSdk.humanizeEvents(
      result.events.contractEventsXdr.flat(),
    );
    const deposit = events.find(
      (event) =>
        event.contractId === this.tokenMessengerAddress &&
        event.topics[0] === 'deposit_for_burn',
    );
    const sent = events.find(
      (event) =>
        event.contractId === this.messageTransmitterAddress &&
        event.topics[0] === 'message_sent',
    );
    if (!deposit || !sent) {
      throw new BadGatewayException(
        'Stellar burn confirmation events are missing',
      );
    }
    const depositData = normalizeDepositEventData(deposit.data);
    const sameBytes = (value: unknown, hex: string) =>
      (Buffer.isBuffer(value) || value instanceof Uint8Array) &&
      Buffer.from(value).equals(Buffer.from(hex.slice(2), 'hex'));
    const expectedDepositor = StellarSdk.StrKey.encodeEd25519PublicKey(
      Buffer.from(expected.messageSender.slice(2), 'hex'),
    );
    const matches = {
      topicCount: deposit.topics.length >= 4,
      dataCount: depositData.length >= 7,
      burnToken: deposit.topics[1] === this.usdcContractAddress,
      depositor: deposit.topics[2] === expectedDepositor,
      finalityTopic:
        deposit.topics[3] != null && BigInt(deposit.topics[3]) === 2000n,
      amount:
        depositData[0] != null && BigInt(depositData[0] as any) === expected.amount,
      mintRecipient: sameBytes(depositData[1], expected.mintRecipient),
      destinationDomain:
        depositData[2] != null &&
        Number(depositData[2]) === expected.destinationDomain,
      destinationMessenger: sameBytes(depositData[3], expected.recipient),
      destinationCaller: sameBytes(depositData[4], `0x${'00'.repeat(32)}`),
      maxFee:
        depositData[5] != null && BigInt(depositData[5] as any) === expected.maxFee,
      hook: sameBytes(depositData[6], '0x'),
    };
    if (!Object.values(matches).every(Boolean)) {
      console.error('Stellar deposit verification mismatch', {
        matches,
        topics: deposit.topics,
        data: depositData,
        expected,
      });
    }
    if (!Object.values(matches).every(Boolean)) {
      throw new BadGatewayException(
        'Stellar deposit_for_burn event does not match the request',
      );
    }
    const bytes = extractMessageEventBytes(sent.data);
    if (!bytes)
      throw new BadGatewayException('Invalid Stellar message_sent event');
    const message = `0x${bytes.toString('hex')}`;
    validateBurnMessage(message, expected, false);
    return { message };
  }

  private parse(xdr: string): StellarSdk.Transaction {
    const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, this.network);
    if (!(tx instanceof StellarSdk.Transaction))
      throw new BadRequestException('Fee-bump envelopes are not supported');
    return tx;
  }

  isExpired(xdr: string): boolean {
    const maxTime = Number(this.parse(xdr).timeBounds?.maxTime ?? 0);
    return maxTime > 0 && maxTime <= Math.floor(Date.now() / 1000);
  }

  verifySignedXdr(
    unsignedXdr: string,
    signedXdr: string,
    expectedAddress: string,
  ) {
    const unsigned = StellarSdk.TransactionBuilder.fromXDR(
      unsignedXdr,
      this.network,
    );

    const signed = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      this.network,
    );

    const unsignedHash = Buffer.from(unsigned.hash());

    const signedHash = Buffer.from(signed.hash());

    if (!unsignedHash.equals(signedHash)) {
      throw new BadRequestException('Signed Stellar transaction was modified.');
    }

    const keypair = StellarSdk.Keypair.fromPublicKey(expectedAddress);

    const valid = signed.signatures.some((signature) =>
      keypair.verify(signedHash, signature.signature()),
    );

    if (!valid) {
      throw new BadRequestException(
        'Expected Stellar wallet did not sign transaction.',
      );
    }

    return signed;
  }

  async submitSignedXdr(
    unsignedXdr: string,
    signedXdr: string,
    expectedAddress: string,
  ) {
    const transaction = this.verifySignedXdr(
      unsignedXdr,
      signedXdr,
      expectedAddress,
    );

    const hash = Buffer.from(transaction.hash()).toString('hex');

    const response = await this.rpc.sendTransaction(transaction);

    if (response.status === 'ERROR') {
      throw new BadRequestException('Stellar transaction rejected.');
    }

    return {
      hash,
      response,
    };
  }

  async broadcast(signedXdr: string) {
    const result = await this.rpc.sendTransaction(this.parse(signedXdr));
    if (result.status === 'TRY_AGAIN_LATER')
      throw new BadGatewayException(
        'Stellar RPC is busy; poll transfer status to retry',
      );
    return result;
  }

  async hasUsdcTrustline(address: string): Promise<boolean> {
    this.validateAddress(address);

    try {
      const account = await this.horizon.loadAccount(address);

      return account.balances.some(
        (balance: any) =>
          balance.asset_type !== 'native' &&
          balance.asset_code === 'USDC' &&
          balance.asset_issuer === this.usdcIssuer,
      );
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return false;
      }

      throw error;
    }
  }
  async getTransaction(hash: string) {
    return this.rpc.getTransaction(hash);
  }
}
