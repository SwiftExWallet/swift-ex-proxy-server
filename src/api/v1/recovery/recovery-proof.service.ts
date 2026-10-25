import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { RecoveryConfigService } from './recovery.config';
import { EncodedProof } from './recovery.types';

const execFileAsync = promisify(execFile);

@Injectable()
export class RecoveryProofService {
  private readonly logger = new Logger(RecoveryProofService.name);
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly config: RecoveryConfigService) {}

  prove(eml: Buffer, salt: string): Promise<EncodedProof> {
    const job = this.queue.then(() => this.run(eml, salt));
    this.queue = job.then(() => undefined, () => undefined);
    return job;
  }

  private async run(eml: Buffer, salt: string): Promise<EncodedProof> {
    const cfg = this.config.recovery;
    const root = cfg.tempDir || tmpdir();
    await mkdir(root, { recursive: true });
    const work = await mkdtemp(join(root, 'swiftex-recovery-'));
    const emlPath = join(work, 'recovery.eml');
    const inputPath = join(work, 'input.json');
    const witnessPath = join(work, 'witness.wtns');
    const proofPath = join(work, 'proof.json');
    const publicPath = join(work, 'public.json');
    try {
      await writeFile(emlPath, eml);
      const env = { ...process.env, CIRCUIT: cfg.circuit, HEIR_SALT: salt };
      await execFileAsync('node', [cfg.inputGenerator, emlPath, inputPath], { cwd: cfg.circuitDir, env, maxBuffer: 1024 * 1024 });
      await execFileAsync('node', [cfg.witnessGenerator, cfg.wasm, inputPath, witnessPath], { cwd: cfg.circuitDir, env, maxBuffer: 1024 * 1024 });
      await execFileAsync(cfg.prover, [cfg.provingKey, witnessPath, proofPath, publicPath], { cwd: cfg.circuitDir, env, maxBuffer: 1024 * 1024 });
      const encoded = await execFileAsync('node', [cfg.proofEncoder, work], { cwd: cfg.circuitDir, env, maxBuffer: 1024 * 1024 });
      const parsed = JSON.parse(encoded.stdout) as { proof: EncodedProof['proof']; public_inputs: string[] };
      if (!parsed.proof || parsed.public_inputs?.length !== 7) throw new Error('proof encoder returned an invalid public-input count');
      this.logger.log(`recovery proof generated; publicInputs=${parsed.public_inputs.length}`);
      return { proof: parsed.proof, publicInputs: parsed.public_inputs };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}
