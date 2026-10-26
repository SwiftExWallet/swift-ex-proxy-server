# 🚀 Wallet Recovery Backend API Walkthrough

This walkthrough exercises the backend API in the intended order. It uses placeholders and does not contain usable credentials, wallet addresses, or transaction hashes.

[← Back to Recovery README](README_RECOVERY.md)

> [!IMPORTANT]
> Run this only against an environment you control. Registration, cancellation, recovery start, and execution can change on-chain state. Use testnet accounts and contracts until the complete flow has been reviewed.

---

## ⚡ Session Setup

Start the configured server from the repository root:

```bash
npm run start:dev
```

In a separate shell, set non-secret request placeholders:

```bash
export API_BASE='http://localhost:3000'
export OWNER='G_REPLACE_WITH_VALID_STELLAR_PUBLIC_KEY'
export DEVICE_TOKEN='REPLACE_WITH_DEVICE_JWT'
export SIGNED_TX_HASH='REPLACE_AFTER_SUBMISSION'
```

The examples use device authentication so registration confirmation can retain device/FCM metadata:

```text
x-auth-device-token: $DEVICE_TOKEN
x-wallet-address: $OWNER
```

Alternatively, routes that do not require device context can use `x-auth-wallet-token`. In both cases the verified JWT/device wallet must resolve to the same Stellar address supplied in the request.

---

## 1. Prepare Recovery Registration

Request owner-signed registration XDR:

```bash
curl --fail-with-body \
  -X POST "$API_BASE/api/v1/recovery/registration/prepare" \
  -H 'content-type: application/json' \
  -H "x-auth-device-token: $DEVICE_TOKEN" \
  -H "x-wallet-address: $OWNER" \
  --data "{
    \"email\": \"owner@example.com\",
    \"walletAddress\": \"$OWNER\",
    \"assets\": [
      { \"type\": \"native\", \"floor\": \"20000000\" }
    ]
  }"
```

Expected shape:

```json
{
  "unsignedXdr": "AAAA..."
}
```

The backend has not submitted this transaction. Decode/review the XDR, sign it with the owner wallet, submit it to the configured Stellar network, and wait for final success. The asset list accepts:

- native: `{ "type": "native", "floor": "20000000" }`;
- classic: `{ "type": "classic", "code": "USDC", "issuer": "G...", "floor": "0" }`;
- contract: `{ "type": "contract", "token": "C...", "floor": "0" }`.

There must be 1–8 assets. Floors are non-negative decimal strings that fit Soroban `i128`; native XLM must preserve at least the configured minimum (and never less than 1 XLM).

---

## 2. Confirm Registration

After the owner-signed transaction succeeds, set its hash and confirm:

```bash
export SIGNED_TX_HASH='REPLACE_WITH_FINALIZED_REGISTRATION_HASH'

curl --fail-with-body \
  -X POST "$API_BASE/api/v1/recovery/registration/confirm" \
  -H 'content-type: application/json' \
  -H "x-auth-device-token: $DEVICE_TOKEN" \
  -H "x-wallet-address: $OWNER" \
  --data "{
    \"email\": \"owner@example.com\",
    \"walletAddress\": \"$OWNER\",
    \"transactionHash\": \"$SIGNED_TX_HASH\"
  }"
```

The backend checks transaction status, reads the on-chain registration, recomputes the email commitment from its salt, then upserts `RecoveryRegistration`. An email mismatch or non-success transaction is rejected.

`POST /registration` is a metadata-only compatibility route. It does not perform these on-chain checks and is not used in this walkthrough.

---

## 3A. Start Recovery by Direct `.eml` Upload

Prepare a real raw email whose signed headers contain a valid `DKIM-Signature`. Preserve CRLF line endings and keep the file at or below 10,000 bytes.

```bash
export EML_PATH='/absolute/path/to/recovery.eml'

curl --fail-with-body \
  -X POST "$API_BASE/api/v1/recovery/start" \
  -H "x-auth-device-token: $DEVICE_TOKEN" \
  -H "x-wallet-address: $OWNER" \
  -F "owner=$OWNER" \
  -F "eml=@$EML_PATH;type=message/rfc822"
```

Expected shape after proof generation and successful keeper submission:

```json
{
  "attemptId": "...",
  "userOpTx": "...",
  "destination": "G...",
  "unlockAt": "...",
  "nullifier": "..."
}
```

`unlockAt` is a contract-derived integer. The BigInt JSON middleware serializes bigint values safely; callers should not assume JavaScript-number precision.

Proof generation is CPU/process intensive and serialized within each server process, so this request can take materially longer than ordinary API calls.

---

## 3B. Start Recovery Through SES/SNS

When AWS integration is configured, send the recovery email from the registered address to the SES receipt address. SES/SNS should call:

```text
POST /api/v1/recovery/ses-hook
```

A simplified local payload shape is:

```json
{
  "Type": "Notification",
  "Message": {
    "mail": { "source": "owner@example.com" },
    "content": "BASE64_ENCODED_RAW_EML"
  }
}
```

The hook immediately returns:

```json
{
  "statusCode": 200
}
```

Processing continues asynchronously. Check server logs and poll status; the webhook response does not mean proof generation or chain submission succeeded.

> [!CAUTION]
> Do not expose a local/manual replay endpoint as a production substitute for SNS verification. The current controller does not verify SNS signatures; production ingress must authenticate trusted AWS deliveries.

---

## 4. Poll Recovery Status

```bash
curl --fail-with-body \
  "$API_BASE/api/v1/recovery/$OWNER" \
  -H "x-auth-device-token: $DEVICE_TOKEN" \
  -H "x-wallet-address: $OWNER"
```

The endpoint returns the latest Mongo attempt or `null`. Typical status progression:

```text
STARTED → PENDING → EXECUTING → COMPLETED
```

Failures become `FAILED`; confirmed cancellation can produce `CANCELLED`. While `PENDING`, use `unlockAt` to decide when to offer execution. Status is persisted backend state, not a fresh contract query.

---

## 5. Execute Recovery

After the contract timelock has elapsed and the latest local attempt is `PENDING`:

```bash
curl --fail-with-body \
  -X POST "$API_BASE/api/v1/recovery/execute" \
  -H 'content-type: application/json' \
  -H "x-auth-device-token: $DEVICE_TOKEN" \
  -H "x-wallet-address: $OWNER" \
  --data "{ \"owner\": \"$OWNER\" }"
```

Expected shape:

```json
{
  "attemptId": "...",
  "userOpTx": "...",
  "result": "..."
}
```

The backend changes local status to `EXECUTING`, submits a keeper-signed `execute_recovery`, then stores `COMPLETED`. Calling too early or without a local pending attempt returns `409 Conflict`; contract rejection maps to a recovery error and the attempt becomes `FAILED`.

---

## 6. Owner-Signed Cancellation

Cancellation uses the same prepare/sign/submit/confirm boundary as registration.

Prepare unsigned XDR:

```bash
curl --fail-with-body \
  -X POST "$API_BASE/api/v1/recovery/cancel/prepare" \
  -H 'content-type: application/json' \
  -H "x-auth-device-token: $DEVICE_TOKEN" \
  -H "x-wallet-address: $OWNER" \
  --data "{ \"owner\": \"$OWNER\" }"
```

Sign and submit the returned `unsignedXdr` with the owner wallet. After it finalizes:

```bash
export SIGNED_TX_HASH='REPLACE_WITH_FINALIZED_CANCELLATION_HASH'

curl --fail-with-body \
  -X POST "$API_BASE/api/v1/recovery/cancel/confirm" \
  -H 'content-type: application/json' \
  -H "x-auth-device-token: $DEVICE_TOKEN" \
  -H "x-wallet-address: $OWNER" \
  --data "{
    \"owner\": \"$OWNER\",
    \"transactionHash\": \"$SIGNED_TX_HASH\"
  }"
```

Confirmation requires transaction success and no remaining on-chain pending recovery. If the latest local attempt is active, it becomes `CANCELLED`.

---

## 🔍 Negative Checks

Use a non-production environment to verify expected protection:

| Check                                                          | Expected result                                                  |
| :------------------------------------------------------------- | :--------------------------------------------------------------- |
| Omit all wallet-auth headers on a protected route              | `401`                                                            |
| Authenticate a different Stellar wallet than `owner`           | `400` owner mismatch                                             |
| Use device token with a wallet not associated with that device | `403`                                                            |
| Upload an email without `DKIM-Signature`                       | `400`                                                            |
| Upload an email larger than 10,000 bytes                       | `400`                                                            |
| Use LF-only instead of CRLF email lines                        | `400`                                                            |
| Start while another attempt is active                          | `409`                                                            |
| Execute without latest status `PENDING`                        | `409`                                                            |
| Confirm a failed/unknown transaction                           | Current implementation surfaces an unmapped server error (`5xx`) |
| Confirm registration with a different email                    | `400` commitment mismatch                                        |

---

## ✅ What a Demonstration Establishes

A complete testnet run should retain evidence for:

- the decoded owner-signed registration and cancellation XDR;
- finalized transaction hashes on the configured network;
- Mongo `RecoveryRegistration` and `RecoveryAttempt` transitions;
- proof-generation logs without raw secrets/email content;
- destination and `unlockAt` matching contract state;
- successful keeper start/execute transaction hashes;
- expected negative checks.

Unit tests and curl response shapes alone do not prove DKIM validity, circuit soundness, deployed contract correctness, timelock enforcement, real asset movement, or production webhook authenticity.
