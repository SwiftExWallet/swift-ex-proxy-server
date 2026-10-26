# SwiftEx Proxy Server

SwiftEx Proxy Server is the NestJS backend for the SwiftEx self-custody wallet. It provides authenticated APIs for device and wallet management, portfolio aggregation, market data, quotes and swaps, transaction history, on/off ramps, cross-chain transfers, notifications, and wallet recovery.

The backend coordinates external blockchain providers and internal persistence without replacing the user's wallet as the authority for owner-controlled operations. Device and wallet middleware binds protected requests to verified addresses, while transaction-building endpoints return payloads for the appropriate client or backend signer.

### Stellar in SwiftEx

Stellar is a core network in SwiftEx rather than an isolated integration. The backend uses the Stellar SDK, Horizon, and Soroban RPC across several product flows:

- **Wallet identity and signing:** validates Stellar `G...` addresses, verifies raw Stellar signatures and WalletConnect signed XDR, and issues wallet-scoped authentication tokens.
- **Wallet activation:** prepares account creation and USDC trustline operations for a new Stellar wallet.
- **Soroswap:** obtains quotes, prepares swaps, handles Soroban authorization, broadcasts transactions, and checks transaction status. The current Soroswap implementation is explicitly testnet-oriented.
- **Stellar/EVM bridging:** coordinates Stellar asset burns or deposits, Circle attestations, EVM destination execution, and persisted transfer status.
- **Assets and portfolio:** supports XLM and Stellar-issued assets alongside EVM balances and transaction history.
- **Wallet recovery:** registers protected assets with Soroban contracts, proves a DKIM-signed recovery email with zkEmail, enforces a contract timelock, and moves assets to a replacement Stellar wallet.

Network-specific account IDs, contract IDs, asset issuers, RPC URLs, and passphrases must all refer to the same Stellar network. Do not mix testnet and public-network configuration.

## Project setup

Prerequisites:

- Node.js and npm compatible with the repository lockfile;
- MongoDB and Redis instances;
- provider credentials and RPC endpoints for the enabled chains;
- AWS, Firebase, and recovery configuration only when those integrations are enabled.

```bash
npm install
cp .env.example .env

# Configure the required values in .env, then start in watch mode.
npm run start:dev
```

## Wallet Recovery Module

### Problem we are solving

A self-custody wallet normally becomes inaccessible when its owner loses the device or signing key. SwiftEx recovery gives the owner a pre-authorized path to move protected Stellar assets to a replacement wallet without giving the backend custody of the owner's secret key.

During registration, the owner signs the on-chain recovery configuration. When recovery is needed, a DKIM-signed email is converted into a zkEmail proof. The SpareKey contract validates that proof, enforces the configured timelock, and allows the registered assets to move to the proven replacement address. The owner can cancel a pending recovery before execution.

For the API summary, architecture, and end-to-end walkthrough, see the [Wallet Recovery Module documentation](README_RECOVERY.md). Use the [circuit setup guide](circut-setup/README.md) to build the recovery circuit and prepare its proving artifacts. Contract source and deployment are maintained in a separate repository.

## Compile and run the project

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
```

## Run tests

```bash
# unit tests
npm test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```
