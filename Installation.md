# ⚙️ Wallet Recovery Backend Installation & Setup

This guide configures the recovery module as part of the complete `swift-ex-proxy-server` NestJS application.

[← Back to Recovery README](README_RECOVERY.md)

---

## 📋 Prerequisites

- Node.js and npm compatible with the repository lockfile (Node 22 is recommended by the current dependency/tooling set; no `engines` constraint is declared).
- A reachable MongoDB database. Recovery registrations and attempts are persisted through Mongoose.
- Redis configuration for the application-wide rate limiter outside `ENVIRONMENT=dev`, or an explicitly chosen fallback policy.
- A Stellar/Soroban RPC endpoint for the same network as every configured contract and keeper account.
- A funded recovery keeper account.
- Deployed SpareKey and zk-verifier contracts plus the native XLM SAC for that network.
- Compiled zkEmail circuit artifacts, Node input/encoding scripts, and a runnable Rapidsnark prover.
- Optional Firebase and AWS SES/SNS infrastructure for notifications and inbound email automation.

> [!WARNING]
> Never commit `.env`, keeper secrets, JWT secrets, database credentials, provider keys, raw `.eml` files, witness files, or proving-job output.

---

## 🚀 Install the Server

Run from the repository root:

```bash
npm install
cp .env.example .env
```

The repository also contains `yarn.lock`, but use one package manager consistently for a given install/change.

---

## 🗄️ Application Datastores

At minimum, configure MongoDB:

```dotenv
MONGODB_CONN_STRING=mongodb://127.0.0.1:27017
DB_NAME=swiftex
MONGO_SERVER_SELECTION_TIMEOUT_MS=5000
```

Production-like environments enforce TLS, non-local MongoDB, and credentials unless an explicit safety override is set. See `src/api/v1/common/config/datastore.config.ts` before deploying.

Redis is used by application-wide guards/services even though recovery persistence itself uses MongoDB:

```dotenv
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
RATE_LIMIT_REDIS_FAILURE_POLICY=fallback-memory
```

In `ENVIRONMENT=dev`, the global rate limiter uses memory. Production-like Redis requires TLS, a password, and normally an ACL username.

---

## 🔑 JWT and Request Authentication

Configure the same JWT settings used by device and wallet token issuance:

```dotenv
JWT_SECRET=replace-with-a-secret-manager-value
JWT_ISSUER=swift-ex
JWT_AUDIENCE=swift-ex-device
```

Do not use the placeholder in a real `.env`. Recovery requests use `x-auth-device-token` plus `x-wallet-address`, or `x-auth-wallet-token`; see the [architecture guide](./Architecture.md#-authentication-and-route-ownership).

---

## ⛓️ Stellar Recovery Configuration

Use network-consistent values:

```dotenv
SWIFTEX_RECOVERY_KEEPER_SECRET=
SWIFTEX_SPAREKEY_ID=
SWIFTEX_ZK_VERIFIER_ID=
SWIFTEX_RECOVERY_XLM_SAC=
SWIFTEX_RECOVERY_RPC_URL=https://soroban-testnet.stellar.org
SWIFTEX_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

SWIFTEX_RECOVERY_FLOOR=20000000
SWIFTEX_RECOVERY_EXPIRY_LEDGERS=2592000
```

| Variable                          | Meaning                                                                                                             |
| :-------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| `SWIFTEX_RECOVERY_KEEPER_SECRET`  | Stellar secret used only for keeper-signed start/execute calls; required when `RecoveryChainService` is constructed |
| `SWIFTEX_SPAREKEY_ID`             | SpareKey recovery contract ID                                                                                       |
| `SWIFTEX_ZK_VERIFIER_ID`          | Expected verifier contract ID checked before recovery starts                                                        |
| `SWIFTEX_RECOVERY_XLM_SAC`        | Configured native-asset contract field; native asset resolution also derives the SAC from the network passphrase    |
| `SWIFTEX_RECOVERY_RPC_URL`        | Soroban RPC URL; falls back to `STELLAR_RPC_URL`, then `RPC_STELLAR`                                                |
| `SWIFTEX_NETWORK_PASSPHRASE`      | Stellar network passphrase used for transactions and asset contract IDs                                             |
| `SWIFTEX_RECOVERY_FLOOR`          | Default minimum native reserve floor in stroops; code never allows less than 10,000,000                             |
| `SWIFTEX_RECOVERY_EXPIRY_LEDGERS` | Ledger offset used for registration allowance expiry                                                                |

The source currently contains testnet-oriented defaults for several public IDs, RPC, and network passphrase. Set every network-specific variable explicitly in deployments; never mix testnet and mainnet values.

---

## 🧮 Circuit and Prover Assets

### Artifact source and prerequisites

The circuit source and build scripts are included in this repository:

```text
circuits/
├── src/legacy_claim.circom       # circuit logic
├── src/claim704.circom           # generated 704-byte wrapper
├── build-circuit.sh              # wrapper generation and Circom compilation
├── prove.sh                      # development contribution, proof, and verifier generation
├── ptau/ppot_0080_21.ptau        # separately supplied Powers of Tau input
└── package.json                  # snarkjs 0.7.6 and zkEmail circuit dependencies
```

Install Circom 2.1.6 and ensure `circom` is on `PATH`. Circuit compilation and setup are memory-intensive; use at least 8 GB RAM, with 16 GB recommended. Then install the circuit dependencies:

```bash
cd circuits
npm install
circom --version
npx snarkjs --version
```

The 2.3 GB Powers-of-Tau file is intentionally not committed. Supply the trusted `ppot_0080_21.ptau` artifact at `circuits/ptau/ppot_0080_21.ptau` and verify its published checksum before setup.

The prover binary is platform-specific and is not committed. Build Rapidsnark for the deployment host and install it as `circuits/bin/rapidsnark-prover`.

### Generate each circuit artifact

Run these commands from `circuits`.

1. Generate the fixed-size wrapper and compile the circuit:

   ```bash
   ./build-circuit.sh 704
   ```

   This generates:

   | Output | How it is generated |
   | :----- | :------------------ |
   | `src/claim704.circom` | `build-circuit.sh` wraps `legacy_claim.circom` with the 704-byte parameters |
   | `build/claim704.r1cs` | Circom constraint output used by Groth16 setup |
   | `build/claim704_js/claim704.wasm` | Circuit runtime used to calculate witnesses |
   | `build/claim704_js/generate_witness.js` | Generated witness command |
   | `build/claim704_js/witness_calculator.js` | Generated witness implementation |

2. Create the initial phase-2 proving key from the matching R1CS and Powers of Tau file:

   ```bash
   npx snarkjs groth16 setup \
     build/claim704.r1cs \
     ptau/ppot_0080_21.ptau \
     build/claim704_0000.zkey
   ```

   `claim704_0000.zkey` is only the uncontributed setup output. It is not the runtime proving key and must never be installed as `claim704_final.zkey`.

3. For testnet or demonstrations only, make one local development contribution:

   ```bash
   npx snarkjs zkey contribute \
     build/claim704_0000.zkey \
     build/claim704_final.zkey \
     --name="legacy-vault-dev" \
     -v \
     -e="$(openssl rand -hex 32)"
   ```

   `prove.sh` performs this same development contribution, exports the verification key, proves a prepared witness, verifies the proof locally, and generates the Soroban verifier contract. It expects a witness at `build/witness704.wtns` by default; override that with `WITNESS=/path/to/witness.wtns`.

4. Export and verify the matching verification key:

   ```bash
   npx snarkjs zkey export verificationkey \
     build/claim704_final.zkey \
     build/verification_key.json

   npx snarkjs zkey verify \
     build/claim704.r1cs \
     ptau/ppot_0080_21.ptau \
     build/claim704_final.zkey
   ```

5. Generate and verify a proof from a prepared input:

   ```bash
   HEIR_SALT=<decimal-registration-salt> CIRCUIT=claim704 \
     node gen-input.mjs recovery.eml build/input.json

   node build/claim704_js/generate_witness.js \
     build/claim704_js/claim704.wasm \
     build/input.json \
     build/witness704.wtns

   npx snarkjs groth16 prove \
     build/claim704_final.zkey \
     build/witness704.wtns \
     build/proof.json \
     build/public.json

   npx snarkjs groth16 verify \
     build/verification_key.json \
     build/public.json \
     build/proof.json
   ```

The `.eml` must be a delivered DKIM-signed message with CRLF line endings. A sent-folder copy usually does not contain the received DKIM signature.

6. Generate and deploy the Soroban verifier that matches this exact verification key. Run from the proxy repository root so the generator receives a safe output path:

   ```bash
   cd ..

   soroban-verifier-gen \
     --vk circuits/build/verification_key.json \
     --proof circuits/build/proof.json \
     --public circuits/build/public.json \
     --out contracts/zkverifier \
     --crate-name legacy-zk-verifier \
     --contract-name ZkEmailGroth16Verifier \
     --soroban-sdk-version v27 \
     --force

   stellar contract build \
     --manifest-path contracts/zkverifier/Cargo.toml

   VERIFIER_ID=$(stellar contract deploy \
     --wasm contracts/zkverifier/target/wasm32v1-none/release/legacy_zk_verifier.wasm \
     --source <DEPLOYER_KEY> \
     --network testnet | tail -1)
   ```

   Point the deployed SpareKey contract at this verifier using its administrator, then confirm the on-chain value:

   ```bash
   stellar contract invoke \
     --id <SPAREKEY_ID> \
     --source <SPAREKEY_ADMIN_KEY> \
     --network testnet \
     --send=yes \
     -- set_verifier --verifier "$VERIFIER_ID"

   stellar contract invoke \
     --id <SPAREKEY_ID> \
     --source <DEPLOYER_KEY> \
     --network testnet \
     -- verifier
   ```

   Set `SWIFTEX_ZK_VERIFIER_ID=$VERIFIER_ID` only after the on-chain `verifier()` result matches. Generating a fresh final zkey without deploying and installing its matching verifier makes every proof fail on-chain. Do not run `prove.sh` after this sequence: it performs another contribution and would replace the final key you just deployed.

### Production phase-2 ceremony

The single-machine contribution above is acceptable only for testnet and demonstrations. Before protecting production funds, run a real phase-2 ceremony in which multiple independent participants contribute entropy to the key in sequence. Each participant receives the previous `.zkey`, runs `snarkjs zkey contribute`, publishes the next `.zkey`, and does not disclose their entropy.

After the ceremony:

1. Verify the final `.zkey` against the exact `claim704.r1cs` and `ppot_0080_21.ptau` used for setup with `snarkjs zkey verify`.
2. Export `verification_key.json` from that final `.zkey`.
3. Generate the Soroban verifier contract from that verification key and deploy it.
4. Use the SpareKey administrator to call `set_verifier` with the new verifier contract ID. This privileged change should use the production multisig and public timelock described by the contract's security model.
5. Read SpareKey's `verifier()` value and confirm it matches the new contract ID before enabling recovery traffic.
6. Configure `SWIFTEX_ZK_VERIFIER_ID` with that same verified contract ID.
7. Publish an artifact manifest containing the circuit source revision, Circom/snarkjs versions, R1CS, ptau, final zkey, WASM, verification-key hashes, and verifier contract ID.

Changing the circuit, wrapper parameters, R1CS, ptau, or final proving key requires a matching verification key and a newly generated/deployed verifier contract. Mixing artifacts from different builds produces proofs that fail on-chain.

### Install generated artifacts in the proxy

The helper scripts and generated WASM runtime are already included. From the repository root, install the locally generated proving key and a Rapidsnark binary built for the deployment host:

```bash
# Install a Rapidsnark binary built for this deployment host.
mkdir -p circuits/bin
install -m 755 /path/to/rapidsnark-prover circuits/bin/rapidsnark-prover
```

Record hashes after copying so the deployed artifacts can be matched to the ceremony manifest:

```bash
sha256sum \
  circuits/build/claim704_final.zkey \
  circuits/build/claim704_js/claim704.wasm \
  circuits/build/claim704_js/generate_witness.js \
  circuits/build/claim704_js/witness_calculator.js \
  circuits/gen-input.mjs \
  circuits/proof-args.mjs \
  circuits/bin/rapidsnark-prover
```

Use `shasum -a 256` instead of `sha256sum` on macOS.

### Runtime layout and configuration

Default circuit layout:

```text
circuits/
├── gen-input.mjs
├── proof-args.mjs
├── build/
│   ├── claim704_final.zkey
│   └── claim704_js/
│       ├── claim704.wasm
│       ├── generate_witness.js
│       └── witness_calculator.js
└── bin/
    └── rapidsnark-prover
```

This checkout includes the two `.mjs` helpers, but compiled circuit/prover files may need to be supplied separately. Configure non-default locations when necessary:

```dotenv
SWIFTEX_CIRCUIT_DIR=circuits
SWIFTEX_CIRCUIT=claim704
SWIFTEX_PROVING_KEY=circuits/build/claim704_final.zkey
SWIFTEX_WASM=circuits/build/claim704_js/claim704.wasm
SWIFTEX_WITNESS_GENERATOR=circuits/build/claim704_js/generate_witness.js
SWIFTEX_PROVER=circuits/bin/rapidsnark-prover
SWIFTEX_INPUT_GENERATOR=circuits/gen-input.mjs
SWIFTEX_PROOF_ENCODER=circuits/proof-args.mjs
SWIFTEX_RECOVERY_TEMP=circuits/recovery-tmp
```

Relative paths are resolved from the process working directory. Start the server from the repository root unless all paths are absolute.

Validate assets before a live proof attempt:

```bash
test -f circuits/gen-input.mjs
test -f circuits/proof-args.mjs
test -f circuits/build/claim704_final.zkey
test -f circuits/build/claim704_js/claim704.wasm
test -f circuits/build/claim704_js/generate_witness.js
test -f circuits/build/claim704_js/witness_calculator.js
test -x circuits/bin/rapidsnark-prover
```

`RecoveryConfigService.assertAssets()` knows these requirements, but the current bootstrap does not call it. Missing assets can therefore appear only when a proof job invokes the toolchain unless deployment validation checks them first.

---

## ✉️ Optional SES/SNS Ingestion

For email-triggered recovery, configure AWS SES to retain the raw email content and deliver an SNS notification shaped as expected by `SesHookController`:

- SNS envelope `Type` and `Message`;
- SES message `mail.source` containing the registered sender;
- SES message `content` containing the base64-encoded raw `.eml`.

Point the subscription at:

```text
POST https://<proxy-host>/api/v1/recovery/ses-hook
```

The route accepts the subscription confirmation handshake. Before exposing it, add ingress allowlisting and AWS SNS signature/certificate validation; the current controller does not perform that verification.

---

## 🏃 Run and Inspect

```bash
# Development/watch mode
npm run start:dev

# Production build and start
npm run build
npm run start:prod
```

Default local URLs:

- API: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs-json`

`PORT` changes the listening port. `API_BODY_LIMIT` changes the general JSON/SES body parser limit, but direct `.eml` upload is separately limited to 10,000 bytes.

---

## ✅ Validation

```bash
# Recovery-only unit tests
npm test -- --runInBand --no-watchman src/api/v1/recovery

# Compile the NestJS server
npm run build

# Optional full test suite
npm test -- --runInBand --no-watchman
```

Before a live test, also confirm:

- MongoDB and the selected rate-limit backend are reachable;
- the keeper public account exists and is funded;
- contract IDs, RPC URL, and network passphrase belong to the same network;
- `verifier()` on SpareKey equals `SWIFTEX_ZK_VERIFIER_ID`;
- all proof files exist and the prover is executable;
- the test `.eml` contains a valid DKIM signature and CRLF line endings;
- the owner has an on-chain registration created by the owner-signed flow.

Passing unit tests/build does not validate live DKIM DNS lookup, proof performance, Soroban contracts, RPC submission, SES delivery, or Firebase delivery.

---

## 🩺 Common Setup Failures

| Symptom                                        | Likely cause                                                                                                |
| :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| Server fails during module construction        | Missing/invalid `SWIFTEX_RECOVERY_KEEPER_SECRET`, Mongo/JWT configuration, or another global app dependency |
| `missing recovery asset` / process spawn error | Circuit path, proving key, witness generator, or prover is absent/not executable                            |
| Verifier mismatch                              | SpareKey points to a different verifier than `SWIFTEX_ZK_VERIFIER_ID`                                       |
| Registration confirmation rejected             | Transaction not finalized, wrong network/hash, or email commitment mismatch                                 |
| Email rejected before proving                  | File over 10 KB, missing `DKIM-Signature`, or LF-only line endings                                          |
| Recovery returns `422`                         | Proof toolchain or contract simulation/submission rejected the operation                                    |
| SES returns 200 but no attempt appears         | Processing is asynchronous; inspect server logs, sender registration, circuit assets, and chain errors      |
