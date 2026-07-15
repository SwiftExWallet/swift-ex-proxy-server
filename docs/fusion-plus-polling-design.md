# Fusion+ Order Polling Design

## Background

The 1inch Fusion+ flow stores order secret state in Redis and starts an in-memory poller after a Fusion+ order is submitted. The poller checks the provider order status, submits secrets when the order is ready, updates MongoDB order status, and clears local polling state when the order reaches a final state.

The prior implementation had two lifecycle issues:

- `refunding` is treated as terminal even though the order still needs future polling until it becomes `refunded`.
- pending-order recovery runs on service initialization. Recovery should not run as a cron job; once startup recovery resumes active orders, each order should continue through its own in-memory poller.

## Goals

- Submit secrets only while the provider order is `pending`.
- Persist `refunding` to MongoDB and continue polling until the provider reaches a final state.
- For `expired`, `refunded`, `cancelled`, and `executed`, update MongoDB, clear Redis secret state, and stop the in-memory poller.
- Stop rescheduling after 5 total reschedules and mark the order as `exhausted`.
- Send a notification for every persisted order status except `refunding`.
- Use `recoverPendingFusionPlusOrders()` as the startup recovery mechanism for orders that still need polling.
- Avoid duplicate in-memory pollers for the same order hash.

## Non-Goals

- Changing how Fusion+ orders are built or submitted.
- Changing Redis secret payload format.
- Changing notification copy or Firebase delivery behavior except where final-state notification is already part of the poller.
- Replacing in-memory pollers with a durable queue.

## Prior Behavior

`startSecretRevealPoller()` previously treated the SDK statuses below as terminal:

- `executed`
- `expired`
- `cancelled`
- `refunded`
- `refunding`

For non-terminal statuses, it checks ready secret fills and submits unsubmitted secrets.

For terminal statuses, it updates MongoDB. If the status is not `refunding`, it sends notification, deletes Redis secret state, and stops the poller.

This creates a bug for `refunding`: the code updates MongoDB, skips cleanup, but also does not schedule the next poll. The poller entry remains in `activeSecretPollers`, but no future timer is scheduled.

## Proposed State Model

Use explicit status buckets instead of one terminal set.

### Secret Submission Statuses

Secrets should be submitted only for:

- `pending`

### Continue Polling Statuses

The poller should schedule another tick for:

- `pending`
- `refunding`

### Final Statuses

The poller should update MongoDB and then stop for provider final statuses:

- `executed`
- `expired`
- `cancelled`
- `refunded`

The poller should also stop for the local final status:

- `exhausted`

## Poller Flow

Each poll tick should follow this sequence:

1. Load secret state from Redis using `fusion_secrets:${orderHash}`.
2. If Redis state is missing, stop the poller and return.
3. Fetch provider status with `sdk.getOrderStatus(orderHash)`.
4. If status is `pending`:
   - call `sdk.getReadyToAcceptSecretFills(orderHash)`
   - submit each unsubmitted ready secret with `sdk.submitSecret(orderHash, secret)`
   - add submitted indexes to `submittedIdx`
   - save updated Redis state when changed
   - schedule the next poll
5. If status is `refunding`:
   - update MongoDB status to `SwapOrderStatus.REFUNDING`
   - keep Redis secret state
   - schedule the next poll
6. If status is final:
   - map provider status to DB status
   - update MongoDB
   - send a status notification
   - delete Redis secret state
   - stop the poller

Every non-final path must schedule the next tick before returning.

## Status Mapping

Use a small helper to make DB status mapping explicit:

```ts
private mapFusionPlusStatus(status: SDKOrderStatus): SwapOrderStatus {
  return SwapOrderStatus[status.toUpperCase()];
}
```

If the product still wants `executed` to appear as `completed`, that should be represented explicitly:

```ts
if (status === SDKOrderStatus.Executed) {
  return SwapOrderStatus.COMPLETED;
}
```

The recommended default is to persist `executed` as `SwapOrderStatus.EXECUTED`, because the provider status is already modeled in the local enum.

Add a local exhausted status for reschedule exhaustion:

```ts
export enum SwapOrderStatus {
  EXHAUSTED = 'exhausted',
}
```

`exhausted` means the service could not reconcile the provider order after the configured reschedule budget. It is an operational failure state, not a provider-reported Fusion+ status.

## Notification Rules

Send a notification after each successful MongoDB status update except when the status is `refunding`.

Notifications should be sent for:

- `pending`, if the poller ever persists a pending status
- `executed`
- `expired`
- `cancelled`
- `refunded`
- `exhausted`

Notifications should not be sent for:

- `refunding`

This keeps users informed about visible state transitions while avoiding noisy refund-in-progress updates.

## Startup Recovery Flow

`recoverPendingFusionPlusOrders()` should recover orders that still need polling, not only orders with status `pending`.

The recovery query should include:

- `SwapOrderStatus.PENDING`
- `SwapOrderStatus.REFUNDING`

The repository should expose a method similar to:

```ts
findByProviderAndStatusesSince(
  provider: swapProvider,
  statuses: SwapOrderStatus[],
  since: Date,
): Promise<DbResult<SwapOrders[]>>
```

The MongoDB query should filter by provider, status list, and recovery window:

```ts
{
  provider,
  status: { $in: statuses },
  createdAt: { $gte: since },
}
```

The service method should keep the current duplicate protection:

```ts
if (this.activeSecretPollers.has(order.txHash)) {
  continue;
}
```

Then it should verify Redis secret state exists before starting a poller.

## Startup Behavior

Recovery should run once when the 1inch service starts:

```ts
async onModuleInit(): Promise<void> {
  await this.recoverPendingFusionPlusOrders();
}
```

`recoverPendingFusionPlusOrders()` should remain a normal method with no `@Cron` decorator.

After startup recovery, active orders progress through their own pollers. If a poller needs more than 5 reschedules, the reschedule exhaustion rule marks the order `exhausted` and stops that poller.

## Concurrency and Idempotency

- Keep `activeSecretPollers` as the in-process duplicate guard.
- Keep `isRecoveringPendingOrders` to prevent overlapping manual or startup recovery executions.
- Secret submission should remain idempotent at the application level by checking `submittedIdx` before calling `submitSecret`.
- If a secret submission succeeds but saving Redis fails, the next poll may retry. Provider-side duplicate handling should be expected, but failures should be logged.

## Error Handling

On non-final statuses or transient provider, Redis, or DB errors:

- increase retry delay with the existing bounded backoff
- increment the reschedule counter whenever a new timer is actually scheduled
- schedule the next poll while the reschedule count is below the maximum
- do not delete Redis state before reschedule exhaustion
- do not remove the active poller entry before reschedule exhaustion

The initial timer does not count as a reschedule. Each later timer scheduled from `pending`, `refunding`, unhandled non-final status, or caught error consumes one reschedule.

The poller should stop when it needs another timer after 5 reschedules have already been used:

```ts
const SECRET_POLL_MAX_RESCHEDULES = 5;
```

When the reschedule limit is reached:

1. Update MongoDB status to `SwapOrderStatus.EXHAUSTED`.
2. Send an `exhausted` notification.
3. Keep or delete Redis state based on operational preference.
4. Stop the poller and remove the order hash from `activeSecretPollers`.

The recommended default is to keep Redis state for exhausted orders until the existing Redis TTL expires, or until an operator-driven recovery flow is added. This preserves the data needed to manually inspect or resume the order.

The reschedule counter should not reset after a successful non-final poll tick. It resets only when the poller stops or the service starts a fresh in-memory poller for the order.

On missing Redis state:

- stop the poller
- leave DB unchanged
- log a warning for observability

## Testing Plan

Add focused unit tests around `startSecretRevealPoller()` behavior with mocked SDK, Redis, and `SwapOrderService`.

Test cases:

- `pending` submits ready secrets, saves `submittedIdx`, and schedules another tick.
- `pending` with no ready fills schedules another tick.
- `refunding` updates DB to `REFUNDING`, does not submit secrets, does not delete Redis state, and schedules another tick.
- `refunded` updates DB, deletes Redis state, and stops polling.
- `expired`, `cancelled`, and `executed` update DB and stop polling.
- final statuses send notifications, except `refunding`.
- `refunding` updates DB but does not send notification.
- 5 poll reschedules are allowed; a sixth reschedule attempt updates DB to `EXHAUSTED`, sends notification, and stops polling.
- successful non-final statuses consume the same reschedule budget as errors.
- missing Redis state stops polling without provider calls.
- startup recovery starts pollers for `pending` and `refunding` orders with Redis state.
- recovery skips orders already in `activeSecretPollers`.

## Rollout Plan

1. Add explicit status buckets and mapping helper.
2. Add `SwapOrderStatus.EXHAUSTED`.
3. Update poller branching so `refunding` continues polling.
4. Add reschedule tracking with `SECRET_POLL_MAX_RESCHEDULES = 5`.
5. Send notifications for every persisted status except `refunding`.
6. Add repository/service method for status-list recovery.
7. Update startup recovery to fetch `pending` and `refunding`.
8. Remove the Fusion+ recovery `@Cron` decorator.
9. Add or update unit tests.
10. Run build and targeted tests.

## Open Questions

- Should `executed` be stored as `executed` or `completed` in MongoDB?
- Should notifications be sent for all final statuses, or only successful/final-positive statuses?
- Should orders without Redis secret state be marked failed after a timeout, or only logged and skipped?
- Should exhausted Redis state be retained until TTL/manual recovery, or deleted immediately?
