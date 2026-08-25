# EVM Module Design

Date: 2026-08-25

## Goal

Add a generic EVM API surface without breaking the existing ETH and BSC routes.
The first version should let new clients call common EVM wallet, token,
transaction, quote, and swap-build operations through `/api/v1/evm`.

## Non-Goals

- Do not remove or rewrite `/api/v1/eth`.
- Do not remove or rewrite `/api/v1/bsc`.
- Do not introduce a generic DEX adapter yet.
- Do not migrate Pancake-specific BSC swap behavior into the generic EVM route.

## Architecture

Add `src/api/v1/evm/` as a new NestJS module:

- `evm.module.ts` imports `ProviderModule`, `QuoterModule`, and `UniswapModule`.
- `evm.controller.ts` owns the new `/api/v1/evm` routes.
- `evm.service.ts` contains shared EVM RPC operations.
- `evm.service.spec.ts` covers the chain resolution and shared service behavior.

Register `EvmModule` in `AppModule`. Existing `EthModule` and `BscModule`
remain registered.

## Routes

Chain-specific RPC routes:

```txt
GET  /api/v1/evm/:chain/:walletAddress/balance
GET  /api/v1/evm/:chain/wallet-address/:walletAddress/info
GET  /api/v1/evm/:chain/:walletAddress/token/:tokenAddress/balance
POST /api/v1/evm/:chain/token/info
POST /api/v1/evm/:chain/transaction/prepare
POST /api/v1/evm/:chain/transaction/broadcast
```

Swap routes:

```txt
POST /api/v1/evm/swap-quote
POST /api/v1/evm/swap-transaction/prepare
```

`:chain` uses existing `ChainEnum` values such as `eth`, `bsc`, `base`, `arb`,
`avax`, `pol`, and `opt`.

## Data Flow

For chain-specific RPC operations:

1. `EvmController` receives `:chain`.
2. `EvmService` resolves it to an existing `ChainEnum` value.
3. `ProviderService` supplies the matching RPC provider.
4. Existing common helpers perform balance, nonce, gas, token, broadcast, and
   transaction preparation work.

For swap quote:

1. `EvmController` receives `SwapQuoteDto`.
2. `QuoterService.getQuoteResponse` handles provider selection using the
   existing chain ID based flow.

For swap transaction build:

1. `EvmController` receives `SwapQuoteDto`.
2. `UniswapService.buildSwapResponse` builds the transaction using the existing
   Uniswap path.

Pancake swap logic remains behind `/api/v1/bsc` until the generic EVM endpoint
needs to select between multiple build backends.

## Wallet Verification

Generic EVM routes use `SupportedWalletChain.multi` for verified wallet
address checks. The existing wallet helpers already collapse most EVM chains to
the multi-chain address.

Legacy ETH and BSC routes keep their current `eth` and `bnb` verification
behavior.

## Error Handling

Invalid or non-EVM `:chain` values return `BadRequestException('Unsupported EVM chain')`.

Supported chains with missing RPC configuration use the existing
`ProviderService` error path and provider error wrapping used by the current
ETH and BSC services.

Broadcast transaction failures use `ProviderErrorCode.TransactionRejected`,
matching existing ETH and BSC behavior.

## Testing

Add focused Jest coverage for:

- resolving supported `:chain` values to the expected provider;
- rejecting unsupported chain values such as `solana`;
- using `SupportedWalletChain.multi` for verified wallet checks;
- broadcasting one signed transaction and a batch;
- preparing a transaction with nonce, gas, fee data, and chain ID from the
  selected provider;
- delegating quote calls to `QuoterService`;
- delegating swap-build calls to `UniswapService`.

Controller tests can stay thin: each route should call the expected service
method with the parsed params, body, and verified wallet.

## Rollout

Ship the new EVM module alongside ETH and BSC. Clients can migrate to
`/api/v1/evm` incrementally. Once production traffic proves the generic route,
legacy controllers can be simplified in a separate change.
