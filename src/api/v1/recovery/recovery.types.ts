export interface RecoveryConfig {
  contractId: string;
  zkVerifierId?: string;
  xlmSac: string;
  registrationFloor: bigint;
  registrationExpiryLedgers: number;
  rpcUrl: string;
  networkPassphrase: string;
  circuitDir: string;
  circuit: string;
  provingKey: string;
  wasm: string;
  witnessGenerator: string;
  prover: string;
  inputGenerator: string;
  proofEncoder: string;
  tempDir: string;
}

export enum RecoveryAttemptStatus {
  STARTED = 'STARTED',
  PENDING = 'PENDING',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface EncodedProof {
  proof: { a: string; b: string; c: string };
  publicInputs: string[];
}

export interface RecoveryRegistration {
  commitment: string;
  salt: string;
}

export interface RecoveryPending {
  destination: string;
  unlockAt: bigint;
  startedAt: bigint;
  nullifier: string;
}
