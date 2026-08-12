# Architecture And Trust Boundaries

## System Overview

The repository implements a NestJS API server for SwiftEX proxy workflows.

Primary runtime components:

- API ingress: NestJS controllers under `src/api/v1/**` plus root `GET /`, `GET /health`, and Swagger docs under `/docs`.
- Middleware and guards: `DeviceAuthTokenMiddleware`, wallet-scoped request checks, global `ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })`, body-size limits, `helmet`, CORS allowlist handling, `bigintJsonSerializerMiddleware`, `BodySizeLimitGuard`, and global `RateLimitGuard`.
- Domain modules: ETH/BSC transaction services, wallet/device management, quoter, 1inch Fusion/Fusion+ swaps, Uniswap swaps, NEAR Intent polling, swap order/exhausted-order tracking, portfolio balance refresh, PNL report/XLS workflows, market data, on/off-ramp services, Firebase notification, Redis, and users.
- Persistence: MongoDB through Mongoose models for users, devices, wallets, orders, swap orders, exhausted orders, portfolio balances, and market data snapshots.
- Volatile state: Redis for rate limiting, provider state, token metadata, locks, subscriptions, and Fusion/Fusion+ secret polling state.
- Background schedulers: EVM transaction pollers, Uniswap transaction poller, transaction receipt status poller, 1inch Fusion+ pollers, NEAR Intent pollers, and exhausted-order reconcilers.
- External services: configured blockchain RPC providers, Blockscout-style explorer APIs, 1inch APIs/WebSockets, Uniswap/Pancake tooling, NEAR Intents, Stellar trading through SDEX/Aquarius Swap, Alchemy Pay, Banxa, MoonPay, CoinGecko, Firebase Cloud Messaging, AWS SSM Parameter Store, AWS S3, ECR/ECS, and GitHub Actions.

## API Surface

Device-authenticated routes are any routes not explicitly excluded in `src/app.module.ts`. The excluded routes are root health/docs routes: `GET /`, `GET /health`, `/docs`, `/docs/*`, and `GET /docs-json`.

Wallet-scoped routes can use a verified device token plus `x-wallet-address`, or `x-auth-wallet-token` where the middleware allows wallet tokens. Those routes include quoter, 1inch swap, swap orders, ETH, USDT, and BSC paths.

| Area | Routes | Security notes |
|---|---|---|
| Health/docs | `GET /`, `GET /health`, `/docs`, `/docs-json` | Public. Should not leak runtime data or secrets. |
| Device | create device, update FCM token, update user link | Requires token under current middleware wiring. Stores FCM token and device identifiers. |
| Wallet | create activated wallet, lookup wallet address, lookup Stellar address | Requires authenticated request context. Wallet ownership is security-critical for downstream routes. |
| ETH | quote, prepare, execute, broadcast, token info, balances, wallet info | Wallet-scoped. Accepts signed transactions and wallet/token identifiers. |
| BSC | quote, prepare, broadcast, token info, balances, wallet info | Wallet-scoped. Accepts signed transactions and wallet/token identifiers. |
| USDT | `POST /api/v1/usdt/swap-transaction/prepare` | Wallet-scoped. Prepares unsigned transaction payloads. |
| Quoter | `POST /api/v1/quoter/quote` | Wallet-scoped. Resolves swap provider and calls 1inch Fusion/Fusion+ quote flows. |
| 1inch | Fusion/Fusion+ quote, build, submit, status, native submit, custom notification | Wallet-scoped except custom notification uses device auth. Contains Fusion/Fusion+ secret handling and order submission. |
| Uniswap | `POST /api/v1/swap` | Requires device token. Builds or submits Uniswap swap flow through backend service. |
| Swap orders | store, list by wallet, get by order hash | Wallet-scoped. Stores device ID and FCM token, and triggers portfolio refresh after successful completion. |
| Portfolio | balance refresh and persisted portfolio data | Used by swap-order and 1inch completion flows to keep token balances current. |
| PNL | profit/loss reporting and downloadable XLS output | Uses trade/order history and portfolio context; output may contain financial history. |
| Market data | `GET /api/v1/market-data` | Requires token under current middleware wiring. Uses CoinGecko-backed stored snapshots. |
| On/off-ramp | Alchemy Pay, Banxa, and MoonPay quote/order/link/currency/assets flows | Requires token under current middleware wiring. Provider payloads influence user-visible order state. |
| Notification | Firebase FCM notification service | Sends push notifications to stored device FCM tokens. |

## Sensitive Assets

| Asset | Location/flow | Why it matters |
|---|---|---|
| Device auth tokens | `x-auth-device-token` header | Gate access to nearly all API routes. |
| Wallet auth tokens | `x-auth-wallet-token` header | Authorize wallet-scoped operations for multi-chain and Stellar wallet addresses. |
| JWT signing secret | `JWT_SECRET` from environment/SSM | Compromise permits token forgery. |
| Device records | MongoDB `Device` | Contains `_id`, `uniqueId`, `macAddress`, `fcmToken`, and user link. |
| User records | MongoDB `User` | Contains email and password hash/field; password is select-false but still sensitive. |
| Wallet records | MongoDB wallet collections | Bind wallet addresses to devices; weak binding can expose balances/orders. |
| Order records | MongoDB `Order`, `SwapOrders`, `ExhaustedOrder` | Contains wallet address, tx hashes, amount, tokens, fiat/crypto order data, webhook/provider responses, FCM token, and encrypted Fusion secrets. |
| Portfolio records | MongoDB `Portfolio` | Contains token balances across supported wallets/chains. |
| PNL/XLS reports | PNL report generation flow | Contains user financial history and trade performance data. |
| Signed transactions | ETH/BSC/Uniswap broadcast/execute endpoints | A signed transaction is an authorization artifact capable of moving funds. |
| Unsigned transaction payloads | Transaction prepare/build endpoints | Tampering can redirect funds, increase approvals, or change execution semantics before user signs. |
| Fusion/Fusion+ secrets | Redis `fusion_secrets:*`, Mongo `encryptedFusionSecrets` | Premature or wrong reveal can affect settlement; loss can break order completion/refunds. |
| Provider API keys | `INCH_API_KEY`, on/off-ramp credentials, `ALCHEMY_API_KEY`, RPC URLs | Abuse can incur cost, quota loss, or data manipulation through provider accounts. |
| Provider event authenticity | Provider webhook/status payloads | Drives order status updates and notifications. |
| Firebase service account | S3 object copied to runtime JSON | Allows sending notifications for the project. |
| Firebase device tokens | Device Mongo records and notification flows | Enables targeted push notifications. |
| AWS SSM parameters | `start.sh`, `fetch-ssm.sh` | Source of runtime secrets. |
| AWS/GitHub deployment trust | GitHub OIDC role, ECR, ECS | Compromise can deploy malicious service images. |
| MongoDB connection string | `MONGODB_CONN_STRING` | Direct database access. |
| Redis password | `REDIS_PWD` | Access to rate-limit state, dedupe keys, subscriptions, and Fusion secrets. |
| Fusion encryption and HMAC keys | `FUSION_SECRETS_ENCRYPTION_KEY`, `MASTER_HASH_KEY` | Protects/generated secret material used in order settlement. |
| Logs | Container/application logs | Current logging can include device objects, decoded/verified JWT payloads, provider responses, webhook payloads, order state, wallet addresses, and SSM values. |

## Trust Boundaries

| Boundary | Crosses from | Crosses to | Data crossing | Security controls observed | Key gaps |
|---|---|---|---|---|---|
| TB1 Internet client to API | Mobile app/browser/attacker | NestJS API | Headers, DTO bodies, signed txs, wallet addresses | Helmet, CORS allowlist, body parser limit, device/wallet middleware, global rate guard, DTO validation | Device revocation/status enforcement is not visible; object authorization must remain consistent across wallet/tx/order lookups |
| TB2 API auth to device/wallet stores | Middleware | MongoDB | Device ID, wallet address, device-wallet binding | JWT `verifyAsync`, device lookup, wallet ownership lookup for wallet-scoped routes | Issuer/audience enforcement depends on env config; token revocation and device status checks are not clearly enforced |
| TB3 API to MongoDB | NestJS services | MongoDB | Device/user/wallet/order/swap-order/exhausted-order/portfolio/market data documents | Mongoose schemas, indexes, service/repository boundaries | Authorization must be enforced before queries; no encryption-at-rest controls visible in repo |
| TB4 API to Redis | API, guard, pollers | Redis | Rate keys, token metadata, provider state, locks, subscriptions, Fusion secrets | Redis password configured, secret-state encryption helpers used in Fusion flows | TLS/config hardening not visible; Redis outage can affect request handling and poller recovery |
| TB5 API to blockchain RPC | ETH/BSC/Provider/Quoter/portfolio services | RPC endpoints and explorers | Calls, estimates, broadcasts, receipts, balances | Chain enum mapping, provider service, route-level limits | Provider trust, quota exhaustion, timeout/retry inconsistency |
| TB6 API to swap/trade providers | API services | 1inch, Uniswap, NEAR Intents, SDEX/Aquarius | Quotes, orders, submissions, statuses, trade execution data | API keys/SDKs/provider clients, wallet-scoped middleware on key routes | Response validation, circuit breaking, and provider error redaction are incomplete |
| TB7 API to on/off-ramp providers | On/off-ramp services | Alchemy Pay, Banxa, MoonPay | Quote/order/link requests, assets/currencies, status payloads | Provider-specific services and DTOs | Provider authenticity/status validation must be strict before updating user-visible state |
| TB8 API to market data provider | Market data service | CoinGecko | Token prices and market snapshots | Stored snapshots in MongoDB | Provider outages/stale data can affect displayed balances and PNL inputs |
| TB9 API to Firebase | Notification service | FCM | Notification payloads and FCM tokens | Firebase Admin SDK credential | Credential file copied at runtime, arbitrary custom notification endpoint to authenticated devices, payload logging risks |
| TB10 Runtime to AWS secrets | Container startup | SSM Parameter Store and S3 | Env secrets, Firebase JSON | AWS CLI with IAM role | Startup script can write `.env`; S3 bucket path and IAM scope must be validated per environment |
| TB11 CI/CD to AWS runtime | GitHub Actions | ECR/ECS | Container image, deployment commands | GitHub OIDC role, branch triggers | Branch/environment protection and role scope must be validated outside repo |
| TB12 App internals to background jobs | Mongo pending orders | Pollers and provider callbacks | Order status, notifications, portfolio refreshes | Cron concurrency flags, provider status checks, exhausted-order records | Provider responses are trusted directly; failure budgets and reconciliation need operational monitoring |
| TB13 Client wallet to API broadcast | User wallet/signing client | Broadcast endpoints | Signed transactions | DTO validation and wallet-scoped middleware on key routes | Signed tx ownership and intent cannot be fully proven server-side; arrays and payload size must stay bounded |
| TB14 Logs/observability | App/runtime | Log sink/operators | Tokens, payloads, env values, errors | Ad hoc logging only | No uniform redaction policy or structured audit trail visible |

## Existing Controls

- `.gitignore` excludes `.env`, `ssmvalues.json`, Firebase service account JSON, build outputs, logs, and dependency directories.
- Docker runner uses a non-root user.
- `JwtService.verifyAsync()` is used for device and wallet tokens in `DeviceAuthTokenMiddleware`.
- Wallet-scoped routes verify the wallet address against the authenticated device or wallet token context.
- Global validation uses `transform`, `whitelist`, and `forbidNonWhitelisted`.
- `helmet` is enabled and CORS is restricted to configured HTTPS/mobile webview origins, plus local development origins outside production.
- Mongoose schemas enforce selected required fields and indexes for user/device/order/swap-order/portfolio data.
- `SwapOrders` stores device ID and FCM token at creation time.
- Several DTOs use `class-validator` for wallet address, enum, string, pagination, and token validation.
- Global `RateLimitGuard` defaults to 100 requests per 60 seconds per IP and supports per-route decorators keyed by IP, device, and wallet.
- Route-level body-size controls exist through `BodySizeLimitGuard` and decorators.
- Some cron jobs prevent overlapping runs with an `isRunning` flag.
- AES-256-GCM is used for encrypted Fusion secrets when `encryptFusionSecrets()` / Fusion secret-state helpers are used.

## Key Architectural Risks

- Device and wallet authentication now verify JWT signatures, but token revocation, device active status, and environment-level issuer/audience requirements still need operational enforcement.
- Public identifiers such as wallet addresses and transaction hashes remain high-risk object selectors; every query path must enforce device/wallet ownership.
- Provider payloads and status responses can drive order status, portfolio refresh, PNL inputs, and user notifications, so external provider data must be treated as untrusted.
- Sensitive runtime values can still be written to local files during startup and may leak through logs if logging is not redacted consistently.
- Redis is part of the security boundary because it stores secrets, locks, provider state, and rate-limit state, not just cache data.
- PNL/XLS output is sensitive financial data and needs authorization, minimization, and export-specific logging controls.
- Third-party provider APIs are a major part of the trust model; provider responses and errors should be validated, bounded, and redacted.
