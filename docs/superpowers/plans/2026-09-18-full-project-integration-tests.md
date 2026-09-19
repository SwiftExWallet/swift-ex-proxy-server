# Full Project Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add broad HTTP integration coverage for every imported API controller route in the Nest `AppModule`.

**Architecture:** Boot the real `AppModule` through Nest's testing module and drive it with `supertest`. Keep routing, middleware, guards, and controllers real; mock only test-hostile state or network edges such as Mongoose, Redis, Firebase, blockchain providers, and provider APIs. DTO validation is intentionally outside this route-contract suite because the existing e2e harness does not bootstrap `main.ts`.

**Tech Stack:** NestJS testing module, Jest, Supertest, TypeScript, existing `npm run test:e2e` harness.

**Spec:** User-approved in-chat design on 2026-09-18: full project route-contract integration coverage with mocked external/state edges, not exhaustive business-branch coverage.

## Global Constraints

- Do not add dependencies.
- Do not call real MongoDB, Redis, Firebase, RPC, 1inch, Uniswap, Banxa, Moonpay, or Alchemy services.
- Keep controllers real. Prefer real internal services for integration paths; mock provider-facing services only where the route's purpose is still HTTP contract, auth, and response mapping.
- Keep `QuoterService` real for quote routes; mock only its external quote adapters such as `InchService` and `UniswapService`.
- Keep at least one EVM broadcast path using real `EvmService` with mocked `ProviderService`.
- Use literal expected response bodies.
- Run `npm run test:e2e -- --runInBand`, `npm test -- --runInBand`, `npm run build`, `npm run lint:check`, and `git diff --check`.

---

### Task 1: Stabilize E2E App Boot

**Files:**

- Modify: `test/e2e-jest.setup.ts`
- Modify: `test/jest-e2e.json`
- Modify: `test/app.e2e-spec.ts`

**Interfaces:**

- Produces: an e2e setup that replaces `MongooseModule.forRootAsync()` and `MongooseModule.forFeature()` with in-memory providers.
- Produces: `test/app.e2e-spec.ts` can boot real `AppModule` without external Mongo, Redis, Firebase, or RPC.

- [x] **Step 1: Write the failing e2e test**

```ts
await request(app.getHttpServer())
  .post('/api/v1/evm/eth/transaction/broadcast')
  .set(WALLET_AUTH_TOKEN_HEADER, walletToken)
  .send({ signedTx: '0xsignedtransaction' })
  .expect(200)
  .expect({ txHash: '0xmockhash', receipt: null });
```

- [x] **Step 2: Run e2e to verify it fails**

Run: `npm run test:e2e -- --runInBand`
Expected: FAIL before setup because `AppModule` attempts a real MongoDB connection.

- [x] **Step 3: Add minimal e2e setup**

Use `test/e2e-jest.setup.ts` to mock `@nestjs/mongoose` module methods and set test env defaults.

- [x] **Step 4: Run e2e to verify it passes**

Run: `npm run test:e2e -- --runInBand`
Expected: PASS for root and EVM broadcast smoke tests.

### Task 2: Add Full Route Contract Matrix

**Files:**

- Modify: `test/app.e2e-spec.ts`

**Interfaces:**

- Consumes: bootable `AppModule` from Task 1.
- Produces: route-contract coverage for imported controllers: root, signing, device, wallet, ETH, BSC, EVM, USDT, market-data, on-off-ramp, quoter, swap, 1inch, swap orders.

- [x] **Step 1: Add service doubles for controller dependencies**

Add service overrides for route-contract tests:

```ts
.overrideProvider(EthService).useValue(ethServiceMock)
.overrideProvider(BscService).useValue(bscServiceMock)
.overrideProvider(WalletService).useValue(walletServiceMock)
.overrideProvider(DeviceService).useValue(deviceServiceMock)
```

Keep `EvmService` real for the EVM broadcast test and satisfy it through `ProviderService`.

- [x] **Step 2: Add auth helpers**

```ts
function walletToken() {
  return jwtService.sign({
    multi: '0x1111111111111111111111111111111111111111',
  });
}

function withWallet(requestBuilder: request.Test) {
  return requestBuilder.set(WALLET_AUTH_TOKEN_HEADER, walletToken());
}
```

- [x] **Step 3: Add success tests for public routes**

Cover:

```ts
GET / GET / api / v1 / signing / request;
POST / api / v1 / signing / verify;
POST / api / v1 / device;
GET / api / v1 / market - data;
GET / api / v1 / on - off - ramp / assets;
```

- [x] **Step 4: Add success tests for wallet-protected route groups**

Cover at least one route per method family and all controller route registrations:

```ts
POST /api/v1/eth/swap-quote
POST /api/v1/eth/transaction/broadcast
POST /api/v1/bsc/transaction/broadcast
POST /api/v1/evm/eth/transaction/broadcast
POST /api/v1/quoter/quote
POST /api/v1/swap
POST /api/v1/swap/1inch/getSwapQuote
POST /api/v1/swapOrders/store
```

- [x] **Step 5: Add auth failure tests**

```ts
await request(app.getHttpServer())
  .post('/api/v1/evm/eth/transaction/broadcast')
  .send({ signedTx: '0xsignedtransaction' })
  .expect(401);

await request(app.getHttpServer())
  .post('/api/v1/wallet')
  .send({ multi: '0x1111111111111111111111111111111111111111' })
  .expect(401);
```

- [x] **Step 6: Run e2e**

Run: `npm run test:e2e -- --runInBand`
Expected: PASS.

### Task 3: Verify and Clean Up

**Files:**

- Modify: `test/app.e2e-spec.ts`
- Modify: `test/e2e-jest.setup.ts`
- Modify: `test/jest-e2e.json`

**Interfaces:**

- Consumes: full route matrix from Task 2.
- Produces: linted, buildable, passing test suite.

- [x] **Step 1: Format touched files**

Run:

```bash
./node_modules/.bin/prettier --write test/app.e2e-spec.ts test/e2e-jest.setup.ts test/jest-e2e.json
```

- [x] **Step 2: Run full verification**

Run:

```bash
npm run test:e2e -- --runInBand
npm test -- --runInBand
npm run build
npm run lint:check
git diff --check
```

Expected: all commands exit 0.

## Self-Review

- Spec coverage: The plan covers full imported-controller route-contract integration coverage and external-edge mocks.
- Placeholder scan: No placeholders remain.
- Type consistency: Helper names and provider names match the Nest services/controllers in this repository.

### Task 4: Move Mocks Below Internal Services

**Files:**

- Modify: `test/app.e2e-spec.ts`
- Modify if a real integration bug is exposed: production service file with the bug

**Interfaces:**

- Consumes: route matrix from Tasks 1-3.
- Produces: e2e coverage that keeps internal service orchestration real and mocks only DB, RPC, HTTP/API, SDK, notification, and provider-adapter boundaries.

- [x] **Step 1: Convert DB-backed modules**

Remove direct overrides for `DeviceService`, `WalletService`, `SigningService`, `MarketDataService`, and `SwapOrderService`. Add repository/infra doubles for `DeviceRepository`, `WalletRepository`, `MarketDataRepository`, `SwapOrderRepository`, and supporting state services.

- [x] **Step 2: Convert chain services**

Remove direct overrides for `EthService` and `BscService`. Keep chain RPC and smart-contract effects mocked through `ProviderService` and DEX adapter services.

- [x] **Step 3: Convert on/off-ramp orchestration**

Remove direct override for `OnOffRampService`. Keep Banxa, MoonPay, Alchemy, and queue processing mocked below it.

- [x] **Step 4: Verify**

Run:

```bash
npm run test:e2e -- --runInBand
npm test -- --runInBand
npm run build
npm run lint:check
git diff --check
```
