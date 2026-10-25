import { Injectable } from '@nestjs/common';
import { Asset, Keypair, Address, Account, BASE_FEE, Contract, nativeToScVal, rpc, scValToNative, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { RecoveryConfigService } from './recovery.config';
import { EncodedProof, RecoveryPending, RecoveryRegistration } from './recovery.types';

export type RecoveryRegistrationAsset = { type: 'native' | 'classic' | 'contract'; token?: string; code?: string; issuer?: string; floor: bigint };

const bytes32 = (value: string) => Buffer.from(value.replace(/^0x/, '').padStart(64, '0'), 'hex');
const bytes = (value: unknown) => Buffer.isBuffer(value) ? value : Buffer.from(value instanceof Uint8Array ? value : String(value));
const addr = (value: string) => new Address(value).toScVal();
const vec = (values: xdr.ScVal[]) => xdr.ScVal.scvVec(values);
const struct = (fields: Record<string, xdr.ScVal>) => xdr.ScVal.scvMap(Object.keys(fields).sort().map(key => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: fields[key] })));

@Injectable()
export class RecoveryChainService {
  private readonly server: rpc.Server;
  private readonly keeper: Keypair;
  private readonly contractId: string;
  private readonly expectedVerifier?: string;
  private readonly networkPassphrase: string;
  private readonly xlmSac: string;
  private readonly registrationFloor: bigint;
  private readonly registrationExpiryLedgers: number;

  constructor(config: RecoveryConfigService) {
    const cfg = config.recovery;
    this.server = new rpc.Server(cfg.rpcUrl, { allowHttp: cfg.rpcUrl.startsWith('http://') });
    this.contractId = cfg.contractId;
    this.expectedVerifier = cfg.zkVerifierId;
    this.networkPassphrase = cfg.networkPassphrase;
    this.xlmSac = cfg.xlmSac;
    this.registrationFloor = cfg.registrationFloor;
    this.registrationExpiryLedgers = cfg.registrationExpiryLedgers;
    const secret = process.env.SWIFTEX_RECOVERY_KEEPER_SECRET ?? process.env.SWIFTEX_KEEPER_SECRET ?? process.env.LEGACY_KEEPER_SECRET;
    if (!secret) throw new Error('SWIFTEX_RECOVERY_KEEPER_SECRET is required');
    this.keeper = Keypair.fromSecret(secret);
  }

  private async read(method: string, args: xdr.ScVal[] = []): Promise<unknown> {
    const source = new Account(this.keeper.publicKey(), '0');
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: this.networkPassphrase }).addOperation(new Contract(this.contractId).call(method, ...args)).setTimeout(30).build();
    const result = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(result)) throw new Error(`${method} failed: ${result.error}`);
    if (!result.result) return null;
    return scValToNative(result.result.retval);
  }

  async registration(owner: string): Promise<RecoveryRegistration | null> {
    const value = await this.read('registration', [addr(owner)]) as Record<string, unknown> | null;
    return value ? { commitment: toHex(value.commitment), salt: toHex(value.salt) } : null;
  }

  async pending(owner: string): Promise<RecoveryPending | null> {
    const value = await this.read('pending', [addr(owner)]) as Record<string, unknown> | null;
    return value ? { destination: String(value.destination), unlockAt: BigInt(value.unlock_at as string | number | bigint), startedAt: BigInt(value.started_at as string | number | bigint), nullifier: toHex(value.nullifier) } : null;
  }

  async assertConfiguredVerifier(): Promise<void> {
    if (!this.expectedVerifier) return;
    const configured = String(await this.read('verifier'));
    if (configured !== this.expectedVerifier) {
      throw new Error(`configured zk verifier ${this.expectedVerifier} does not match SpareKey verifier ${configured}`);
    }
  }

  previewDestination(publicInputs: string[]) {
    return this.read('preview_destination', [vec(publicInputs.map(value => xdr.ScVal.scvBytes(bytes32(value))))]).then(String);
  }

  startRecovery(owner: string, encoded: EncodedProof) {
    const proof = struct({ a: xdr.ScVal.scvBytes(bytes32(encoded.proof.a)), b: xdr.ScVal.scvBytes(bytes32(encoded.proof.b)), c: xdr.ScVal.scvBytes(bytes32(encoded.proof.c)) });
    return this.invoke('start_recovery', [addr(owner), proof, vec(encoded.publicInputs.map(value => xdr.ScVal.scvBytes(bytes32(value))))]);
  }

  executeRecovery(owner: string) { return this.invoke('execute_recovery', [addr(owner)]); }

  async prepareRegistration(owner: string, commitment: Buffer, salt: Buffer, assets: RecoveryRegistrationAsset[]): Promise<string> {
    const latest = await this.server.getLatestLedger();
    const encodedAssets = xdr.ScVal.scvVec(assets.map(asset => struct({
      floor: nativeToScVal(asset.floor, { type: 'i128' }),
      token: addr(this.resolveAssetToken(asset)),
    })));
    return this.prepare(owner, 'register_and_approve', [
      addr(owner), xdr.ScVal.scvBytes(commitment), xdr.ScVal.scvBytes(salt), encodedAssets,
      nativeToScVal(170141183460469231731687303715884105727n, { type: 'i128' }),
      xdr.ScVal.scvU32(Number(latest.sequence) + this.registrationExpiryLedgers),
    ]);
  }

  private resolveAssetToken(asset: RecoveryRegistrationAsset): string {
    if (asset.type === 'native') return Asset.native().contractId(this.networkPassphrase);
    if (asset.type === 'classic' && asset.code && asset.issuer) return new Asset(asset.code, asset.issuer).contractId(this.networkPassphrase);
    if (asset.type === 'contract' && asset.token && /^C[A-Z2-7]{55}$/.test(asset.token)) return asset.token;
    throw new Error('invalid recovery asset');
  }

  prepareCancellation(owner: string): Promise<string> {
    return this.prepare(owner, 'cancel_recovery', [addr(owner)]);
  }

  async finalized(hash: string): Promise<void> {
    const result = await this.server.getTransaction(hash);
    if (result.status !== 'SUCCESS') throw new Error('recovery transaction is not finalized successfully');
  }

  private async prepare(owner: string, method: string, args: xdr.ScVal[]): Promise<string> {
    const account = await this.server.getAccount(owner);
    const tx = new TransactionBuilder(account, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: this.networkPassphrase }).addOperation(new Contract(this.contractId).call(method, ...args)).setTimeout(60).build();
    return (await this.server.prepareTransaction(tx)).toXDR();
  }

  private async invoke(method: string, args: xdr.ScVal[]) {
    const account = await this.server.getAccount(this.keeper.publicKey());
    const built = new TransactionBuilder(account, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: this.networkPassphrase }).addOperation(new Contract(this.contractId).call(method, ...args)).setTimeout(60).build();
    const simulation = await this.server.simulateTransaction(built);
    if (rpc.Api.isSimulationError(simulation)) throw new Error(`${method} simulation failed: ${simulation.error}`);
    const prepared = rpc.assembleTransaction(built, simulation).build() as Transaction;
    prepared.sign(this.keeper);
    const sent = await this.server.sendTransaction(prepared);
    if (sent.status === 'ERROR') throw new Error(`${method} rejected`);
    const done = await this.server.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
    if (done.status !== 'SUCCESS') throw new Error(`${method} did not succeed: ${done.status}`);
    return { hash: sent.hash, returnValue: done.returnValue ? scValToNative(done.returnValue) : undefined };
  }
}

function toHex(value: unknown): string {
  return bytes(value).toString('hex');
}
