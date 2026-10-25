/**
 * snarkjs proof.json + public.json  ->  the JSON arguments the Soroban CLI wants.
 *
 *   node proof-args.mjs out3            # prints --proof and --public_inputs values
 *
 * Encoding, which is where this usually goes wrong:
 *   G1 = x || y, each 32 bytes big-endian.
 *   G2 = x1 || x0 || y1 || y0. The HIGH half of each Fp2 element comes first,
 *        which is the reverse of how snarkjs stores it ([c0, c1]).
 */
import { readFileSync } from 'node:fs';

const DIR = process.argv[2] ?? 'out3';
const fe = (n) => BigInt(n).toString(16).padStart(64, '0');
const g1 = (p) => fe(p[0]) + fe(p[1]);
const g2 = (p) => fe(p[0][1]) + fe(p[0][0]) + fe(p[1][1]) + fe(p[1][0]);

const proof = JSON.parse(readFileSync(`${DIR}/proof.json`));
const pub = JSON.parse(readFileSync(`${DIR}/public.json`));

const out = {
  proof: { a: g1(proof.pi_a), b: g2(proof.pi_b), c: g1(proof.pi_c) },
  public_inputs: pub.map(fe),
};

if (process.argv[3] === '--field') {
  console.log(JSON.stringify(out[process.argv[4]]));
} else {
  console.log(JSON.stringify(out, null, 2));
}
