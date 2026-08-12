# Security Architecture Review

Assessment date: 2026-07-14

This directory contains a Level-1 security architecture review and STRIDE threat model for the SwiftEX proxy server repository. The review is based on static analysis of the local codebase; runtime infrastructure, production configuration, live AWS IAM policies, network topology, and real secrets were not inspected. A local `.env` file exists in the workspace but was intentionally not read.

OWASP mapping uses the official OWASP API Security Top 10 2023 categories: <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>.

## Documents

- [Architecture and trust boundaries](./architecture.md)
- [Level-1 data flow diagram](./data-flow-diagram.md)
- [STRIDE threat model with DREAD ratings](./threat-model.md)
- [Mitigation backlog](./mitigations.md)

## Executive Summary

The service is a NestJS API that fronts wallet, swap/trade, quote, swap-order, portfolio, PNL report, market-data, on/off-ramp, and Firebase FCM notification workflows. It stores device/order/user/wallet/portfolio data in MongoDB, uses Redis for rate limiting, locks, provider state, subscriptions, and Fusion/Fusion+ secrets, calls multiple third-party blockchain/on-ramp providers, and deploys through GitHub Actions to AWS/ECR/ECS with secrets fetched from SSM and S3 at container startup.

The highest-risk issues found are:

1. Device and wallet authentication verify JWTs, but token revocation, device status, and strict issuer/audience configuration still need operational enforcement.
2. Provider payloads/statuses can drive order state, portfolio refreshes, PNL inputs, and notifications, so response authenticity and validation remain critical.
3. Swap order reads and updates use public identifiers such as wallet address and transaction hash and must keep enforcing ownership against the authenticated device/wallet.
4. Startup scripts echo SSM parameter values into logs and write secrets to `/app/.env`.
5. Redis stores Fusion secret material without a guaranteed TTL and the default `setKey` path can store secrets indefinitely.
6. DTO coverage and business-specific constraints must stay complete across provider-backed request bodies and report exports.
7. Expensive provider-backed quote, order, transaction, status, and poller flows need consistent timeout policy and circuit breaking.

## Security Posture At A Glance

| Area | Current posture | Target posture |
|---|---|---|
| Authentication | Device and wallet middleware use JWT verification and attach request context | Enforce issuer/audience in every environment plus token revocation/device status |
| Authorization | Device object is attached to requests, but many object operations use wallet or tx hash only | Enforce object ownership and provider/admin-only mutation paths |
| Input validation | Global transform, `whitelist`, and `forbidNonWhitelisted` are enabled; many DTOs and body-size limits exist | Strong DTOs and business-specific constraints for all public payloads and report exports |
| Provider events | Provider statuses and callbacks can mutate state/send notifications | Provider signature verification where applicable, replay windows, idempotency, allowlisted sources where feasible |
| Secrets | SSM/S3 used, `.env` gitignored, Firebase JSON gitignored | No secret values in logs/filesystem, encrypted short-lived Redis secrets, rotation and scoped IAM |
| Rate limiting | Global IP-based guard plus route decorators on key flows, Redis-backed outside dev | Route/business-flow quotas keyed by device, wallet, provider, endpoint, and source IP |
| Third-party APIs | Multiple providers trusted directly | Strict response validation, timeouts, retries with bounds, circuit breakers, reconciliation |
| Auditability | Console/debug logs include sensitive payloads; no structured security audit trail | Redacted structured logs, request IDs, auth principal, event IDs, immutable audit records |
