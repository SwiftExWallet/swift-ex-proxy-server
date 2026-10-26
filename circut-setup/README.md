# Recovery Circuit Setup

This folder contains the zkEmail recovery circuit source and tools used by the
SwiftEx proxy. The folder name is `circut-setup`. Contracts are maintained in a
separate repository; the proxy backend runs from the parent repository root.

## Files

```text
circuits/
├── src/legacy_claim.circom   # email signature, commitment, and payout constraints
├── src/claim704.circom       # fixed 704-byte header wrapper
├── build-circuit.sh         # generate the wrapper and compile with Circom
├── prove-email.sh           # generate a witness, prove, and verify locally
├── gen-input.mjs            # DKIM-signed email to circuit inputs
├── proof-args.mjs           # proof and public signals to Soroban arguments
├── package.json
└── package-lock.json
```

Local dependencies, `build/`, `bin/`, and `ptau/` are ignored by Git. Existing
compiled artifacts are kept locally, but a fresh checkout must build or supply
them. Raw emails, circuit inputs, witnesses, and proof work directories are
also ignored.

## Compile and prepare the proving key

Install Node.js/npm and Circom 2.1.6. Circuit compilation and setup need at least
8 GB RAM; 16 GB is recommended. From the proxy repository root:

```bash
cd circut-setup/circuits
npm install
mkdir -p build
./build-circuit.sh 704
```

Supply the trusted `ppot_0080_21.ptau` file at
`circut-setup/circuits/ptau/ppot_0080_21.ptau` and verify its published checksum.
Then follow the [artifact generation and ceremony steps](../Installation.md#generate-each-circuit-artifact)
to create `build/claim704_final.zkey` and export `build/verification_key.json`.
The initial `_0000.zkey` is not a usable final proving key. A local development
contribution is for testnet only; production requires a multi-party ceremony.

The final proving key, compiled WASM, and deployed verifier must come from the
same setup. Generate and deploy the matching verifier in the separate contracts
repository, as described in the installation guide.

## Prove an email locally

Build Rapidsnark for the host platform and install the executable at
`circut-setup/circuits/bin/rapidsnark-prover`. From `circut-setup/circuits`:

```bash
HEIR_SALT=<decimal-registration-salt> ./prove-email.sh /absolute/path/recovery.eml
node proof-args.mjs out
```

Use the delivered DKIM-signed email with its original CRLF line endings and the
salt stored in the on-chain registration. Input generation needs DNS access to
verify the DKIM key. The prover sees the raw email; keep inputs and witnesses
private.

## Install in the proxy

Follow [Install generated artifacts in the proxy](../Installation.md#install-generated-artifacts-in-the-proxy)
to copy the final proving key, WASM, witness runtime, and prover into the proxy's
`circuits/` runtime directory. Start the backend from the proxy repository root.

See the [Recovery README](../README_RECOVERY.md) for API usage and the
[Installation & Setup Guide](../Installation.md) for backend configuration,
verifier deployment, and validation.
