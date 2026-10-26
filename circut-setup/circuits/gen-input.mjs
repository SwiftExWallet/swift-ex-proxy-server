/**
 * Turns a real .eml into inputs for the LegacyVaultClaim circuit.
 *
 * The heavy lifting (DKIM verification, header canonicalisation, splitting the
 * RSA key and signature into field-sized chunks) comes from zkEmail's helpers.
 * What we add is the two regex start indices and the salt.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateEmailVerifierInputs } from '@zk-email/helpers/dist/input-generators.js';
import crypto from 'node:crypto';

const CIRCUIT = process.env.CIRCUIT ?? 'claim704';
const WASM = `build/${CIRCUIT}_js/${CIRCUIT}.wasm`;

/**
 * The circuit and this file agree only by convention: input names must match
 * `signal input` declarations, and array lengths must match their declared
 * sizes. Nothing enforced that, so a mismatch surfaced later as
 * "Too many values for input signal X", which names the symptom and not the
 * cause. This asks the compiled circuit what it actually expects.
 *
 * Signal names are stored in the wasm as FNV-1a hashes, so we look each one up
 * the same way the witness generator does.
 */
function fnvHash(str) {
  let hash = BigInt('0xCBF29CE484222325');
  for (const ch of str) {
    hash ^= BigInt(ch.charCodeAt(0));
    hash = (hash * BigInt(0x100000001b3)) % (BigInt(2) ** BigInt(64));
  }
  return hash.toString(16).padStart(16, '0');
}

async function circuitExports() {
  if (!existsSync(WASM)) return null;
  const { instance } = await WebAssembly.instantiate(readFileSync(WASM), {
    runtime: { exceptionHandler: () => {}, printErrorMessage: () => {}, writeBufferMessage: () => {}, showSharedRWMemory: () => {} },
  });
  return instance.exports;
}

/** How many values the circuit wants for one named input, or -1 if unknown. */
function signalSize(exports, name) {
  const h = fnvHash(name);
  return exports.getInputSignalSize(parseInt(h.slice(0, 8), 16), parseInt(h.slice(8, 16), 16));
}

async function checkAgainstCircuit(input) {
  const exports = await circuitExports();
  if (!exports) {
    console.warn(`  ! ${WASM} not found, skipping circuit check`);
    return;
  }

  const problems = [];
  for (const [name, value] of Object.entries(input)) {
    const size = signalSize(exports, name);
    const given = Array.isArray(value) ? value.length : 1;
    if (size < 0) problems.push(`${name}: circuit has no such input`);
    else if (size !== given) problems.push(`${name}: circuit wants ${size}, we built ${given}`);
  }
  if (problems.length) {
    console.error(`\ninputs do not match circuit '${CIRCUIT}':`);
    for (const p of problems) console.error('  ' + p);
    console.error(`\nhint: the circuit is built for one fixed size; rebuild it or use the matching one.`);
    process.exit(1);
  }
}
const EML = process.argv[2];
const OUT = process.argv[3] ?? 'inputs/input.json';

if (!EML) {
  console.error('usage: node gen-input.mjs <file.eml> [out.json]');
  console.error('  env: CIRCUIT (default claim704), HEIR_SALT (decimal; required for a real vault)');
  process.exit(1);
}
if (!existsSync(EML)) {
  console.error(`no such file: ${EML}`);
  process.exit(1);
}

const raw = readFileSync(EML);

// The header buffer size is a property of the compiled circuit, so read it from
// there rather than keeping a copy in sync by hand.
const exportsForSize = await circuitExports();
const MAX_HEADERS = exportsForSize
  ? signalSize(exportsForSize, 'emailHeader')
  : Number(process.env.MAX_HEADERS ?? 704);
if (MAX_HEADERS <= 0) {
  console.error(`circuit ${CIRCUIT} has no emailHeader input`);
  process.exit(1);
}

const base = await generateEmailVerifierInputs(raw, {
  ignoreBodyHashCheck: true,          // headers only — keeps us under 2^21
  maxHeadersLength: MAX_HEADERS,
});

// The canonicalised header, exactly as the circuit sees it.
const headerBytes = base.emailHeader.map(Number);
const header = Buffer.from(headerBytes).toString('latin1');
const used = Number(base.emailHeaderLength);

// The regexes prove the match; these indices only say where to read it from.
const fromLine = header.indexOf('from:');
if (fromLine < 0) { console.error('no from: header found in the signed headers'); process.exit(1); }
const addrStart = header.indexOf('<', fromLine) >= 0
  ? header.indexOf('<', fromLine) + 1
  : header.indexOf(':', fromLine) + 1;
const subjLine = header.indexOf('subject:');
if (subjLine < 0) { console.error('no subject: header found in the signed headers'); process.exit(1); }
const subjStart = subjLine + 'subject:'.length;

const emailAddr = header.slice(addrStart, header.indexOf('>', addrStart) >= 0
  ? header.indexOf('>', addrStart) : addrStart + 60).split(/[\r\n]/)[0];
const subject = header.slice(subjStart).split(/\r?\n/)[0];

// The salt must be the SAME one stored in the vault, or the commitment will not
// match and the contract will read the proof as a different person. A random
// salt is only ever right for standalone testing of the proving pipeline.
const salt = process.env.HEIR_SALT
  ? BigInt(process.env.HEIR_SALT)
  : BigInt('0x' + crypto.randomBytes(31).toString('hex'));
const saltIsRandom = !process.env.HEIR_SALT;

const input = {
  emailHeader: base.emailHeader,
  emailHeaderLength: base.emailHeaderLength,
  pubkey: base.pubkey,
  signature: base.signature,
  fromEmailIndex: String(addrStart),
  subjectIndex: String(subjStart),
  heirSalt: salt.toString(),
};

await checkAgainstCircuit(input);

writeFileSync(OUT, JSON.stringify(input, null, 2));

console.log('DKIM verified and inputs generated');
console.log('  header bytes used   :', used, `of ${MAX_HEADERS}`);
console.log('  RSA chunks (pubkey) :', base.pubkey.length);
console.log('  RSA chunks (sig)    :', base.signature.length);
console.log('  from address        :', JSON.stringify(emailAddr));
console.log('  fromEmailIndex      :', addrStart);
console.log('  subject             :', JSON.stringify(subject));
console.log('  subjectIndex        :', subjStart);
console.log('  salt                :', '0x' + salt.toString(16).slice(0, 16) + '…',
  saltIsRandom ? '(RANDOM - testing only, pass HEIR_SALT for a real vault)' : '(from HEIR_SALT)');
console.log('  written to          :', OUT);
