import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Networks } from '@stellar/stellar-sdk';
import { RecoveryConfig } from './recovery.types';

@Injectable()
export class RecoveryConfigService {
  readonly recovery: RecoveryConfig;

  constructor() {
    const configuredPath = (name: string, fallback: string): string =>
      resolve(process.cwd(), process.env[name] ?? fallback);
    const circuitDir = configuredPath('SWIFTEX_CIRCUIT_DIR', 'circuits');
    const circuit = process.env.SWIFTEX_CIRCUIT ?? 'claim704';
    this.recovery = {
      contractId: process.env.SWIFTEX_SPAREKEY_ID ?? 'CD4D3YHVYIYIM3WUJYY6XTIQCU3KOBNPJN52S4KAPNRFBI7JVFFRPLQ5',
      zkVerifierId: process.env.SWIFTEX_ZK_VERIFIER_ID ?? 'CAKZ7WNCU6A4M5TO4YJPV7YAN62GANI676QA23JUAVUEJL7M3COJSYVK',
      xlmSac: process.env.SWIFTEX_RECOVERY_XLM_SAC ?? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      registrationFloor: BigInt(process.env.SWIFTEX_RECOVERY_FLOOR ?? '20000000'),
      registrationExpiryLedgers: Number(process.env.SWIFTEX_RECOVERY_EXPIRY_LEDGERS ?? '2592000'),
      rpcUrl: process.env.SWIFTEX_RECOVERY_RPC_URL ?? process.env.STELLAR_RPC_URL ?? process.env.RPC_STELLAR ?? 'https://soroban-testnet.stellar.org',
      networkPassphrase: process.env.SWIFTEX_NETWORK_PASSPHRASE ?? Networks.TESTNET,
      circuitDir,
      circuit,
      provingKey: configuredPath('SWIFTEX_PROVING_KEY', resolve(circuitDir, 'build', `${circuit}_final.zkey`)),
      wasm: configuredPath('SWIFTEX_WASM', resolve(circuitDir, 'build', `${circuit}_js`, `${circuit}.wasm`)),
      witnessGenerator: configuredPath('SWIFTEX_WITNESS_GENERATOR', resolve(circuitDir, 'build', `${circuit}_js`, 'generate_witness.js')),
      prover: configuredPath('SWIFTEX_PROVER', resolve(circuitDir, 'bin', 'rapidsnark-prover')),
      inputGenerator: configuredPath('SWIFTEX_INPUT_GENERATOR', resolve(circuitDir, 'gen-input.mjs')),
      proofEncoder: configuredPath('SWIFTEX_PROOF_ENCODER', resolve(circuitDir, 'proof-args.mjs')),
      tempDir: configuredPath('SWIFTEX_RECOVERY_TEMP', resolve(circuitDir, 'recovery-tmp')),
    };
  }

  assertAssets(): void {
    const required = ['provingKey', 'wasm', 'witnessGenerator', 'prover', 'inputGenerator', 'proofEncoder'] as const;
    for (const name of required) {
      if (!existsSync(this.recovery[name])) throw new Error(`missing recovery asset ${name}: ${this.recovery[name]}`);
    }
    const witnessCalculator = resolve(dirname(this.recovery.witnessGenerator), 'witness_calculator.js');
    if (!existsSync(witnessCalculator)) {
      throw new Error(`missing recovery asset witness calculator: ${witnessCalculator}`);
    }
  }
}
