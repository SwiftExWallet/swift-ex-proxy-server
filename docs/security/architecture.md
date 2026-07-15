# Architecture And Trust Boundaries

## System Overview

The repository implements a NestJS API server for SwiftEX proxy workflows.

Primary runtime components:

- API ingress: NestJS controllers under `src/api/v1/**` plus root `GET /` and `GET /health`.
- Middleware and guards: `DeviceAuthTokenMiddleware`, global `ValidationPipe({ transform: true })`, `bigintJsonSerializerMiddleware`, open CORS, and global `RateLimitGuard`.
- Domain modules: ETH/BSC transaction services, Uniswap quoter, 1inch Fusion/Fusion+ swap services, Rango, Allbridge, transaction history, order tracking, webhooks, notification, Redis, users, and devices.
- Persistence: MongoDB through Mongoose models for `User`, `Device`, `Order`, and `SwapOrders`.
- Volatile state: Redis for rate limiting, webhook dedupe, active subscriptions, and Fusion/Fusion+ secret state.
- Background schedulers: cron pollers for Uniswap, generic EVM transactions, Rango, and Allbridge.
- External services: blockchain RPC providers, Blockscout, Alchemy, 1inch, Rango, Allbridge, Uniswap/Pancake SDKs, Firebase Cloud Messaging, AWS SSM Parameter Store, AWS S3, ECR/ECS, and GitHub Actions.

## API Surface

Device-authenticated routes are any routes not explicitly excluded in `src/app.module.ts`. The excluded routes are root health routes, public provider webhooks, and `POST /api/v1/quoter/quote`.

| Area | Routes | Security notes |
|---|---|---|
| Health | `GET /`, `GET /health` | Public. Should not leak build/runtime data. |
| ETH | quote, prepare, execute, broadcast, token info, balances, wallet info | Requires device token. Accepts signed transactions and wallet/token identifiers. |
| BSC | quote, prepare, broadcast, token info, balances, wallet info | Requires device token. Accepts signed transactions and wallet/token identifiers. |
| USDT | `POST /api/v1/usdt/swap-transaction/prepare` | Requires device token. |
| Quoter | `POST /api/v1/quoter/quote`, `POST /api/v1/quoter/swap` | `quote` is public; `swap` requires device token. |
| 1inch | quote/build/submit/status/cancel/native/custom notification | Requires device token. Contains Fusion/Fusion+ secret handling and order submission. |
| Rango | metadata, route, confirm, prepare tx, approval/status | Requires device token. Calls Rango provider APIs. |
| Bridge | Allbridge quotes and transaction preparation | Requires device token. Calls Allbridge SDK/provider RPCs. |
| Swap orders | store, list by wallet, bridge status, update status, get by order hash | Requires device token, but operations are not consistently bound to the authenticated device. |
| Transaction history | Alchemy wallet transaction history | Requires device token. Exposes wallet transaction history for supplied address. |
| Webhooks | Stellar, Moralis, Alchemy on/off ramp, Banxa | Public by middleware exclusion; source authentication is not implemented in code. |

## Sensitive Assets

| Asset | Location/flow | Why it matters |
|---|---|---|
| Device auth tokens | `x-auth-device-token` header | Gate access to nearly all API routes. |
| JWT signing secret | `JWT_SECRET` from environment/SSM | Compromise permits token forgery if verification is correctly enabled later. |
| Device records | MongoDB `Device` | Contains `_id`, `uniqueId`, `macAddress`, `fcmToken`, and user link. |
| User records | MongoDB `User` | Contains email and password hash/field; password is select-false but still sensitive. |
| Order records | MongoDB `Order`, `SwapOrders` | Contains wallet address, tx hashes, amount, tokens, fiat/crypto order data, webhook responses, FCM token, encrypted Fusion secrets. |
| Signed transactions | ETH/BSC broadcast/execute endpoints | A signed transaction is an authorization artifact capable of moving funds. |
| Unsigned transaction payloads | Transaction prepare/build endpoints | Tampering can redirect funds, increase approvals, or change execution semantics before user signs. |
| Fusion/Fusion+ secrets | Redis `fusion_secrets:*`, Mongo `encryptedFusionSecrets` | Premature or wrong reveal can affect settlement; loss can break order completion/refunds. |
| Provider API keys | `INCH_API_KEY`, `RANGO_API_KEY`, `ALCHEMY_API_KEY`, RPC URLs | Abuse can incur cost, quota loss, or data manipulation through provider account. |
| Webhook event authenticity | Provider webhook payloads/tags | Drives order status updates and notifications. |
| Firebase service account | S3 object copied to runtime JSON | Allows sending notifications for the project. |
| Firebase device tokens | Device Mongo records and notification flows | Enables targeted push notifications. |
| AWS SSM parameters | `start.sh`, `fetch-ssm.sh` | Source of runtime secrets. |
| AWS/GitHub deployment trust | GitHub OIDC role, ECR, ECS | Compromise can deploy malicious service images. |
| MongoDB connection string | `MONGODB_CONN_STRING` | Direct database access. |
| Redis password | `REDIS_PWD` | Access to rate-limit state, dedupe keys, subscriptions, and Fusion secrets. |
| Webhook tag encryption key | `TAG_SECRET_KEY` | Protects/decrypts notification routing tags. |
| Fusion encryption and HMAC keys | `FUSION_SECRETS_ENCRYPTION_KEY`, `MASTER_HASH_KEY` | Protects/generated secret material used in order settlement. |
| Logs | Container/application logs | Current logging can include device objects, decoded JWTs, webhook payloads, provider responses, and SSM values. |

## Trust Boundaries

| Boundary | Crosses from | Crosses to | Data crossing | Security controls observed | Key gaps |
|---|---|---|---|---|---|
| TB1 Internet client to API | Mobile app/browser/attacker | NestJS API | Headers, DTO bodies, signed txs, wallet addresses | Device middleware for most routes, global rate guard, DTO validation | JWT is decoded not verified, open CORS, weak object authorization, inconsistent whitelisting |
| TB2 Public webhook to API | Provider networks/attacker | Webhook controllers | Webhook payloads, tags, order numbers, statuses | DTOs on some webhooks, TAG_SECRET_KEY decryption for Stellar/Moralis tags | No provider signature validation, replay window, or source authentication |
| TB3 API to MongoDB | NestJS services | MongoDB | Device/user/order/swap-order documents | Mongoose schemas, unique indexes on email/txHash | Authorization must be enforced before queries; no encryption-at-rest controls visible in repo |
| TB4 API to Redis | API, guard, webhooks, pollers | Redis | Rate keys, dedupe keys, active subscriptions, Fusion secrets | Redis password configured | Secrets can be stored without TTL, no TLS/config hardening visible, Redis outage can affect all requests |
| TB5 API to blockchain RPC | ETH/BSC/Provider/Quoter services | RPC endpoints | Calls, estimates, broadcasts, receipts | Chain enum mapping and static network where configured | Provider trust, quota exhaustion, timeout/retry inconsistency |
| TB6 API to swap/bridge providers | API services | 1inch, Rango, Allbridge, Alchemy, Blockscout | Quotes, route requests, order submission/status, history | API keys, SDKs | Response validation, circuit breaking, and provider error redaction are incomplete |
| TB7 API to Firebase | Notification service | FCM | Notification payloads and FCM tokens | Firebase Admin SDK credential | Credential file copied at runtime, arbitrary notification endpoint to authenticated devices, payload logging risks |
| TB8 Runtime to AWS secrets | Container startup | SSM Parameter Store and S3 | Env secrets, Firebase JSON | AWS CLI with IAM role | Startup script logs secret values and writes `.env`; S3 bucket path hardcoded to dev name |
| TB9 CI/CD to AWS runtime | GitHub Actions | ECR/ECS | Container image, deployment commands | GitHub OIDC role, branch triggers | Branch/environment protection not visible; action permissions and role scope must be validated outside repo |
| TB10 App internals to background jobs | Mongo pending orders | Pollers and provider callbacks | Order status, notifications | Cron concurrency flags, provider status checks | Manual update route bypasses poller trust; poller provider responses are trusted directly |
| TB11 Client wallet to API broadcast | User wallet/signing client | Broadcast endpoints | Signed transactions | DTO requires string/array | No ownership check that signed tx corresponds to authenticated device/wallet; arrays not bounded |
| TB12 Logs/observability | App/runtime | Log sink/operators | Tokens, payloads, env values, errors | None apparent beyond ad hoc logging | No redaction policy, structured audit trail, or secret-safe startup logging |

## Existing Controls

- `.gitignore` excludes `.env`, `ssmvalues.json`, Firebase service account JSON, build outputs, logs, and dependency directories.
- Docker runner uses a non-root user.
- Mongoose schemas enforce selected required fields and unique indexes for email and swap transaction hashes.
- `SwapOrders` stores device ID and FCM token at creation time.
- Several DTOs use `class-validator` for wallet address, enum, string, pagination, and token validation.
- `POST /api/v1/quoter/quote` uses route-level `ValidationPipe({ transform: true, whitelist: true })`.
- Global `RateLimitGuard` defaults to 100 requests per 60 seconds per IP and supports per-route decorators.
- Some cron jobs prevent overlapping runs with an `isRunning` flag.
- AES-256-GCM is used for encrypted Fusion secrets when `encryptFusionSecrets()` is used.

## Key Architectural Risks

- Authentication is present but cryptographically ineffective for device tokens until JWT signatures are verified.
- Public identifiers such as wallet addresses and transaction hashes are used as object selectors without device ownership checks.
- Public webhooks can drive notifications and order state without verifying provider signatures.
- Sensitive runtime values are written to local files and logs during startup.
- Redis is part of the security boundary because it stores secrets and rate-limit state, not just cache data.
- Third-party provider APIs are a major part of the trust model; provider responses and errors should be treated as untrusted inputs.

