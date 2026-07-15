# Mitigation Backlog

This backlog groups the threat mitigations into implementation phases. Threat IDs refer to [threat-model.md](./threat-model.md).

## P0 - Immediate Fixes

### 1. Verify Device JWTs

Threats: T01, T03, T04, T21, T31

Required changes:

- Replace `jwtService.decode()` with `jwtService.verifyAsync()` in `DeviceAuthTokenMiddleware`.
- Validate `exp`, `iat`, `iss`, `aud`, and algorithm.
- Fail closed on missing/invalid/expired tokens.
- Add a device status/revocation field if not present, or check a token version on the device record.
- Stop logging decoded token contents and full device objects.

Acceptance criteria:

- Forged unsigned tokens are rejected.
- Tokens signed with the wrong secret are rejected.
- Expired tokens are rejected.
- Valid tokens for disabled/deleted devices are rejected.

### 2. Authenticate Public Webhooks

Threats: T02, T10, T11, T29, T30

Required changes:

- Implement provider-specific signature checks for Stellar, Moralis, Alchemy, and Banxa.
- Verify timestamp freshness with a short tolerance window.
- Store provider event IDs or signature digests in Redis/Mongo with TTL for replay prevention.
- Validate provider account/app/merchant identifiers before processing.
- Reject unsigned test payloads outside non-production environments.

Acceptance criteria:

- Unsigned webhook requests return 401 or 403.
- Replayed signed webhooks are ignored idempotently.
- Webhook status transitions are rejected if they do not match an allowed state transition.

### 3. Enforce Object Ownership

Threats: T03, T04, T21, T31

Required changes:

- Add `deviceId` or user/account ownership checks to all `SwapOrders` reads and writes.
- Update repository methods to query by `{ txHash, deviceId }` or `{ walletAddress, deviceId }` where client-facing.
- Move order status mutation behind worker/provider-only authorization.
- For wallet-driven APIs, require a wallet signature challenge or persisted wallet-device binding.

Acceptance criteria:

- Device A cannot read or update Device B's order by wallet address or tx hash.
- Public transaction hashes are not sufficient authorization tokens.
- Status mutation requires worker/provider/admin credentials.

### 4. Stop Secret Logging And Plaintext Startup Output

Threats: T05, T16, T25, T32

Required changes:

- Remove `echo "${env_var_name}=${param_value}"` from `start.sh`.
- Log only secret names and redacted values such as `ADDED: JWT_SECRET=[redacted]`.
- Avoid writing all secrets to `/app/.env`; prefer ECS secrets injection or runtime environment variables.
- Redact provider URLs containing API keys.
- Remove debug logs that print webhook bodies, device documents, decoded tokens, order events, and provider responses.

Acceptance criteria:

- Container startup logs contain no secret values.
- Application logs contain no device token, FCM token, private key, API key, or full webhook payload.
- A log redaction helper or logger configuration is used consistently.

## P1 - High-Value Hardening

### 5. Harden Validation And Payload Limits

Threats: T07, T13, T28, T33

Required changes:

- Change the global pipe to:

```ts
new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
})
```

- Add DTOs for `any` webhook and notification bodies.
- Bound arrays such as `signedTransactions` and `txs`.
- Add `MaxLength`, numeric ranges, enum checks, and token amount format checks.
- Configure global JSON/body size limits and stricter webhook limits.

Acceptance criteria:

- Unknown DTO properties are rejected globally.
- Oversized bodies, strings, and arrays are rejected before service execution.
- Client-supplied token metadata is cross-checked server-side.

### 6. Improve Rate Limiting And Abuse Controls

Threats: T09, T13, T15, T18, T23, T33

Required changes:

- Key rate limits by device id, wallet address, endpoint, provider, and IP.
- Add route-specific limits for quote, route, broadcast, webhook, custom notification, and status endpoints.
- Define separate anonymous quotas for `POST /api/v1/quoter/quote` or require auth.
- Configure trusted proxy handling so `request.ip` is reliable behind load balancers.
- Add request cost budgets for provider-backed calls.

Acceptance criteria:

- A single device cannot exhaust provider quotas through quote/broadcast loops.
- Public webhook endpoints tolerate burst traffic without provider/API degradation.
- Redis failure behavior is documented and tested.

### 7. Protect Fusion/Fusion+ Secret State

Threats: T06, T20, T24

Required changes:

- Always set Redis TTL for `fusion_secrets:*` keys.
- Encrypt secret state before Redis storage or use a dedicated secret store.
- Fix `revealSecret()` retry limit and add exponential backoff.
- Store only required secret material and delete it on all terminal states.
- Prefer exact-amount token approvals over unlimited approvals.

Acceptance criteria:

- Fusion secret keys expire automatically.
- Provider failure cannot create infinite recursion or unbounded retry loops.
- Approval transaction responses clearly show spender and allowance.

### 8. Harden Third-Party API Consumption

Threats: T12, T14, T17, T22, T32

Required changes:

- Centralize `axios`/`fetch` calls behind a provider client wrapper.
- Enforce timeout, retry budget, backoff, circuit breaker, and response schema validation.
- Allowlist outbound provider hosts and require HTTPS.
- Move API keys from query params to headers where provider supports it.
- Return stable, client-safe errors instead of raw provider responses.

Acceptance criteria:

- All provider calls time out within an agreed SLA.
- Provider outages degrade gracefully with clear internal telemetry.
- Provider API keys never appear in URLs or client-visible errors.

## P2 - Programmatic Controls

### 9. Add Auditability And Idempotency

Threats: T10, T12, T19, T31

Required changes:

- Add request IDs to all responses and logs.
- Require idempotency keys for submit, broadcast, and order-store flows.
- Store audit records with principal/device id, route, action, request hash, provider response id, and outcome.
- Store raw provider status evidence for state transitions.

Acceptance criteria:

- Duplicate order/broadcast requests are recognized and safely replayed.
- Operators can determine who or what caused an order status transition.

### 10. Separate Public, Provider, Worker, And Admin APIs

Threats: T04, T18, T31

Required changes:

- Move worker-only status update routes out of the public client router.
- Use signed service tokens, mTLS, or private networking for worker/admin routes.
- Keep webhook routes public only where provider signature validation is mandatory.
- Remove public/custom notification test endpoints from production.

Acceptance criteria:

- Client device credentials cannot invoke worker/admin actions.
- Provider-only routes reject client tokens.

### 11. Validate Deployment And Runtime Configuration

Threats: T22, T25, T26, T27

Required changes:

- Validate required env vars at startup with a schema and fail closed on unsafe values.
- Enforce production host allowlists for provider URLs.
- Use environment-specific S3 paths or remove S3 credential file flow.
- Review AWS IAM role scope for SSM, S3, ECR, and ECS.
- Pin GitHub Actions by SHA and enforce protected branches/environments.
- Require image scanning/signing before ECS deployment.

Acceptance criteria:

- The app refuses to start with non-HTTPS provider URLs in production.
- ECS task role cannot read unrelated SSM paths or S3 buckets.
- Deployments require protected branch policy and reviewed changes.

## Security Test Plan

| Test area | Required tests |
|---|---|
| Auth | Forged JWT, expired JWT, wrong issuer/audience, deleted device, missing header |
| Authorization | Cross-device read/update by tx hash, cross-device orderByWallet, unauthorized status mutation |
| Webhooks | Missing signature, bad signature, old timestamp, replayed event, wrong merchant/app id, invalid state transition |
| Validation | Unknown DTO properties, oversized body, oversized arrays, invalid chain/provider/token/amount |
| Rate limits | Per-device quote flood, public quoter flood, webhook burst, broadcast loop |
| Secrets/logs | Unit/static checks that common secret names and token fields are redacted |
| Provider clients | Timeout behavior, retry limit, circuit breaker open/close, response schema rejection |
| Pollers | Provider failure, malformed status response, duplicate finalization, notification failure |
| Deployment | CI role least privilege, environment protection, secret path scoping, image scan/signature gate |

## Suggested Implementation Order

1. Device JWT verification and logging redaction.
2. Webhook signatures, replay protection, and status state machines.
3. Object authorization for swap orders and removal of public status mutation.
4. Global validation hardening and body limits.
5. Rate-limit redesign for business flows.
6. Provider client wrapper with timeouts, schema validation, and safe errors.
7. Redis/Fusion secret TTL and encryption hardening.
8. CI/CD and AWS IAM review.

