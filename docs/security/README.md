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

The service is a NestJS API that fronts wallet, swap, bridge, transaction history, order tracking, webhook, and notification workflows. It stores device/order/user data in MongoDB, uses Redis for rate limiting, idempotency, subscriptions, and Fusion/Fusion+ secrets, calls multiple third-party blockchain providers, and deploys through GitHub Actions to AWS/ECR/ECS with secrets fetched from SSM and S3 at container startup.

The highest-risk issues found are:

1. Device authentication decodes JWTs but does not verify signatures before trusting `_id`.
2. Public webhook endpoints accept state-changing provider messages without source signature validation.
3. Swap order reads and updates use public identifiers such as wallet address and transaction hash without checking ownership against the authenticated device.
4. Startup scripts echo SSM parameter values into logs and write secrets to `/app/.env`.
5. Redis stores Fusion secret material without a guaranteed TTL and the default `setKey` path can store secrets indefinitely.
6. Global validation does not use `whitelist` or `forbidNonWhitelisted`, leaving multiple DTOs exposed to over-posting and unknown properties.
7. Expensive provider-backed quote, route, transaction, webhook, and poller flows have incomplete rate limits, no consistent timeout policy, and limited circuit breaking.

## Security Posture At A Glance

| Area | Current posture | Target posture |
|---|---|---|
| Authentication | Device middleware checks `x-auth-device-token`, but uses `jwt.decode()` instead of `verify()` | Verify token signature, issuer, audience, expiration, revocation/device status |
| Authorization | Device object is attached to requests, but many object operations use wallet or tx hash only | Enforce object ownership and provider/admin-only mutation paths |
| Input validation | Global transform enabled; some route-level whitelisting; many DTOs have decorators | Global `whitelist`, `forbidNonWhitelisted`, body size limits, strong DTOs for all public payloads |
| Webhooks | Several webhook routes are public and mutate state/send notifications | Provider signature verification, replay windows, idempotency, allowlisted sources where feasible |
| Secrets | SSM/S3 used, `.env` gitignored, Firebase JSON gitignored | No secret values in logs/filesystem, encrypted short-lived Redis secrets, rotation and scoped IAM |
| Rate limiting | Global IP-based guard, Redis-backed outside dev; one route-specific decorator | Route/business-flow quotas keyed by device, wallet, provider, endpoint, and source IP |
| Third-party APIs | Multiple providers trusted directly | Strict response validation, timeouts, retries with bounds, circuit breakers, reconciliation |
| Auditability | Console/debug logs include sensitive payloads; no structured security audit trail | Redacted structured logs, request IDs, auth principal, event IDs, immutable audit records |

