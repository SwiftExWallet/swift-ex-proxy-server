# 🏗️ Wallet Recovery Backend Architecture

This guide describes the implemented NestJS recovery module in `src/api/v1/recovery`. It is an implementation reference, not a claim that the surrounding contracts or production infrastructure have been independently audited.

[← Back to Recovery README](README_RECOVERY.md)

---

## 📌 Responsibilities

The backend coordinates five boundaries:

- authenticated API callers and their verified Stellar wallet;
- MongoDB registration/attempt records;
- DKIM email parsing and zkEmail proof tooling;
- the Stellar Soroban RPC and SpareKey/verifier contracts;
- Firebase notifications and the optional SES/SNS ingestion path.

It does not hold the owner's Stellar secret key. Registration and cancellation transactions are returned as unsigned XDR for the owner to sign. Recovery start and execution are signed by the configured backend keeper.

For the complete sequence and authority boundaries, [view the rendered recovery flow](docs/recovery-flow.svg) or [open its editable Draw.io source](docs/recovery-flow.drawio).

---

## 🧩 Component Map

| Component                     | Responsibility                                                                            |
| :---------------------------- | :---------------------------------------------------------------------------------------- |
| `RecoveryController`          | Wallet-authenticated registration, start, status, execute, and cancellation routes        |
| `SesHookController`           | SNS subscription confirmation and asynchronous SES recovery ingestion                     |
| `RecoveryService`             | Start/status/execute orchestration and attempt state changes                              |
| `RecoveryTransactionService`  | Email commitments, asset policy, owner-signed registration/cancellation XDR, confirmation |
| `RecoveryChainService`        | Soroban reads, transaction preparation, keeper signing/submission, polling                |
| `RecoveryProofService`        | Serialized proof jobs and temporary artifact cleanup                                      |
| `RecoveryRegistrationService` | Normalized email-to-wallet/device metadata in MongoDB                                     |
| `RecoveryAttemptService`      | Latest attempt lookup, active-attempt exclusion, and status updates                       |
| `RecoveryConfigService`       | Contract, network, circuit, proof-tool, and temporary-directory configuration             |

`RecoveryModule` registers both Mongo schemas, imports `NotificationModule`, and exposes the controllers and services through Nest dependency injection.

---

## 🗃️ Persistence

### `RecoveryRegistration`

One record is upserted per `walletAddress` and stores:

- normalized lowercase `email`;
- Stellar `walletAddress` (unique/indexed);
- `deviceUniqueId`;
- `fcmToken`;
- Mongoose timestamps.

The record is used to map an SES sender to its registered wallet and to retain notification delivery metadata. The primary on-chain registration remains the contract state, not this Mongo record.

### `RecoveryAttempt`

Each attempt stores the owner, status, optional start/execute transaction hashes, destination, `unlockAt`, failure message, and timestamps. The status lifecycle is:

```text
STARTED ──> PENDING ──> EXECUTING ──> COMPLETED
    │           │             │
    └───────────┴─────────────┴────> FAILED

STARTED / PENDING / EXECUTING ── confirmed cancellation ──> CANCELLED
```

`createStarted` rejects a second active attempt for the same owner. `status` returns the latest Mongo attempt; it does not re-read the contract on every request.

---

## 🔐 Authentication and Route Ownership

`DeviceAuthTokenMiddleware` treats `/api/v1/recovery` as wallet-required, except `POST /api/v1/recovery/ses-hook`.

Protected callers can authenticate in either supported form:

1. `x-auth-device-token` plus `x-wallet-address`: the backend verifies that the address belongs to the authenticated device and attaches both device and wallet context.
2. `x-auth-wallet-token`: the JWT supplies the verified `xlm` address. This does not attach device context.

The controller compares every body/path owner with the authenticated `xlm` wallet. A mismatch produces `400 Bad Request`. Metadata registration and registration confirmation require `req.device`, so callers should use the device-token plus wallet-address form for those routes.

Global validation strips unknown DTO fields and rejects non-whitelisted values. Global body-size and rate-limit guards also apply.

### Webhook exception

`POST /api/v1/recovery/ses-hook` does not require device or wallet JWT headers so AWS can call it. The current controller:

- accepts JSON even when the content type is nonstandard;
- follows `SubscribeURL` for `SubscriptionConfirmation`;
- parses notification `Message`, sender, and base64 content;
- acknowledges with `{ "statusCode": 200 }` before background proof processing finishes.

It does **not** validate an AWS SNS signing certificate/signature or restrict `SubscribeURL` in controller code. A production deployment must add trusted SNS verification and ingress restrictions; network exposure alone should not be treated as authenticity.

---

## 🔄 Registration Flow

### Recommended owner-signed flow

1. Caller sends email, wallet, and 1–8 assets to `POST /registration/prepare`.
2. `RecoveryTransactionService` normalizes the email, generates a 32-byte salt, packs the email, and derives its Poseidon commitment.
3. Native XLM floors are checked against the greater of `10,000,000` stroops (1 XLM) and `SWIFTEX_RECOVERY_FLOOR`; every floor must fit Soroban `i128`.
4. `RecoveryChainService` resolves each native/classic/contract asset to a token contract and prepares `register_and_approve` XDR from the owner's account.
5. The API returns `{ "unsignedXdr": "..." }`. The owner signs and submits it outside this module.
6. Caller sends the finalized transaction hash to `POST /registration/confirm`.
7. The backend requires RPC status `SUCCESS`, reads on-chain registration, recomputes the email commitment using the stored on-chain salt, and rejects a mismatch.
8. Mongo registration metadata is upserted and a best-effort “Recovery enabled” notification is sent.

`POST /registration` only upserts metadata. It does not create or validate an on-chain registration and should not replace the prepare/sign/confirm flow when contract-backed recovery is required.

---

## ✉️ Recovery Start Flow

Recovery can begin through authenticated multipart upload or the SES/SNS hook. Both converge on `RecoveryService.start(owner, eml)`:

1. Validate the owner as a Stellar `G...` public key.
2. Validate `.eml` size (at most 10,000 bytes), presence of `DKIM-Signature`, and CRLF line endings.
3. Read `pending` from the contract. If nothing is pending on-chain, remove any stale active Mongo attempt for the owner.
4. Create a Mongo attempt in `STARTED`; the partial unique index rejects concurrent active attempts.
5. Verify the configured zk verifier matches the SpareKey contract verifier.
6. Read the owner's on-chain registration; reject missing registration or an existing pending recovery.
7. Generate a proof using the registration salt.
8. Call `preview_destination` from proof public inputs.
9. Keeper-sign and submit `start_recovery`.
10. Read `pending` back from the contract. If present, persist `PENDING`, transaction hash, destination, and `unlockAt`.
11. Return `attemptId`, `userOpTx`, `destination`, `unlockAt`, and `nullifier`.

Any caught start failure changes the created attempt to `FAILED` and maps the error to an HTTP exception.

---

## 🧮 Proof Generation Pipeline

`RecoveryProofService` serializes proof jobs through an in-process promise queue. For each job it creates a unique temporary directory, then runs:

```text
DKIM-signed .eml
  │ node circuits/gen-input.mjs (CIRCUIT, HEIR_SALT)
  ▼
input.json
  │ generated witness script + circuit WASM
  ▼
witness.wtns
  │ rapidsnark prover + proving key
  ▼
proof.json + public.json
  │ node circuits/proof-args.mjs
  ▼
{ proof: { a, b, c }, publicInputs[7] }
```

The input generator uses zkEmail helpers for DKIM verification/canonicalization, builds circuit input indices, and supplies the on-chain registration salt as `HEIR_SALT`. The encoder must return exactly seven public inputs. The job directory is recursively removed in a `finally` block whether proof generation succeeds or fails.

The queue is process-local: multiple server replicas do not share it. Capacity planning and cross-replica concurrency control are deployment concerns.

---

## ⛓️ Stellar Contract Integration

### Read/simulation calls

- `registration(owner)` → email commitment and salt;
- `pending(owner)` → destination, unlock/start times, and nullifier;
- `verifier()` → configured verifier contract;
- `preview_destination(publicInputs)` → destination derived from proof inputs.

### Owner-signed prepared transactions

- `register_and_approve` for registration and asset allowances;
- `cancel_recovery` for cancellation.

The backend prepares these transactions but returns unsigned XDR. The caller owns signing and submission.

### Keeper-signed transactions

- `start_recovery(owner, proof, publicInputs)`;
- `execute_recovery(owner)`.

For keeper calls, the backend simulates, assembles, signs with `SWIFTEX_RECOVERY_KEEPER_SECRET`, submits, and polls up to 30 times using one-second sleeps. The keeper must be valid for the configured network and funded for fees.

---

## ⏳ Status, Execution, and Cancellation

`GET /:owner` returns the latest local attempt. `POST /execute` requires that attempt to have local `PENDING` status, changes it to `EXECUTING`, and submits `execute_recovery`. The backend does not check `unlockAt` before submission; the SpareKey contract enforces unlock readiness. If no local `PENDING` attempt exists, the API returns `409 Conflict`. A contract rejection returns `422 Unprocessable Entity` and changes the local attempt to `FAILED`. A successful execution stores `COMPLETED` and the transaction hash.

Cancellation is owner-controlled:

1. `POST /cancel/prepare` returns unsigned `cancel_recovery` XDR.
2. Owner signs and submits it.
3. `POST /cancel/confirm` verifies final transaction success and ensures no pending recovery remains on-chain.
4. An active local attempt, if present, becomes `CANCELLED`.

---

## 🔔 Notifications

The controller sends Firebase notifications after registration confirmation, recovery start, and recovery completion when authenticated device context has an FCM token. Notification failures are swallowed so they cannot turn a successful chain/database operation into an API error.

Wallet-token-only calls may succeed without notification because no device is attached to the request.

---

## ⚠️ Errors and Operational Semantics

| Condition                                                           | Typical response/behavior                                 |
| :------------------------------------------------------------------ | :-------------------------------------------------------- |
| Missing/invalid wallet authentication                               | `401 Unauthorized`                                        |
| Device wallet not associated with device                            | `403 Forbidden`                                           |
| Owner differs from authenticated Stellar wallet                     | `400 Bad Request`                                         |
| Invalid owner, `.eml`, DTO, floor, or email-commitment confirmation | `400 Bad Request`                                         |
| Existing active attempt or no local `PENDING` attempt               | `409 Conflict`                                            |
| Proof/contract start or execution rejection                         | `422 Unprocessable Entity`                                |
| Non-success registration/cancellation transaction lookup            | Currently an unmapped chain error (`500` by Nest default) |
| Firebase send failure                                               | Operation remains successful; notification is skipped     |
| SES background processing failure                                   | Webhook was already acknowledged; error is logged         |

The generic recovery error mapper includes underlying error messages in some `422` responses. Do not put secrets in thrown process/contract errors or logs.

---

## ✍️ Signing and Trust Boundaries

| Boundary                           | Trust/ownership                                                           |
| :--------------------------------- | :------------------------------------------------------------------------ |
| Owner wallet key                   | Remains with the client; signs registration/cancellation                  |
| Keeper secret                      | Backend secret; signs start/execute and must be tightly controlled        |
| Email authenticity                 | zkEmail/DKIM proof pipeline and circuit correctness                       |
| Recovery timing and asset movement | Deployed SpareKey contract                                                |
| Registration delivery mapping      | MongoDB record plus verified on-chain commitment at confirmation          |
| API wallet identity                | JWT/device-wallet middleware and controller owner comparison              |
| SES event authenticity             | Deployment controls; not verified cryptographically by current controller |
| Temporary proof data               | Local filesystem, removed after each proof job                            |

Do not infer a security audit from the presence of validation or tests. Production readiness also requires contract/circuit review, secret management, RPC hardening, authenticated webhook handling, logging review, and live end-to-end validation.
