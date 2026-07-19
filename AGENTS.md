# Repository Guidelines

## Project Structure & Module Organization
This is a NestJS TypeScript service. Application bootstrap lives in `src/main.ts`, with root wiring in `src/app.module.ts`. Versioned API modules are under `src/api/v1/`, organized by domain such as `eth`, `bsc`, `swap`, `swapOrders`, `orders`, `bridge`, `redis`, `users`, and `notification`. Shared DTOs, helpers, guards, middleware, config, enums, and interfaces live in `src/api/v1/common/`. Unit tests sit beside implementation files as `*.spec.ts`; e2e tests live in `test/`. Security and architecture notes are in `docs/`. Root shell scripts handle AWS SSM and deployment setup.

## Build, Test, and Development Commands
- `npm install`: install dependencies from `package-lock.json`.
- `npm run start:dev`: run the Nest app in watch mode for local development.
- `npm run build`: compile TypeScript into `dist/`.
- `npm run start:prod`: run the compiled app from `dist/main`.
- `npm test`: run unit tests configured in `package.json`.
- `npm run test:e2e`: run e2e tests with `test/jest-e2e.json`.
- `npm run test:cov`: generate Jest coverage in `coverage/`.
- `npm run lint`: run ESLint with auto-fix.
- `npm run format`: format `src/**/*.ts` and `test/**/*.ts` with Prettier.

## Coding Style & Naming Conventions
Use TypeScript and NestJS conventions: modules as `*.module.ts`, services as `*.service.ts`, controllers as `*.controller.ts`, repositories as `*.repository.ts`, and DTOs under `dto/`. Keep domain code inside its feature directory and shared logic in `common/`. Prefer dependency injection over manual construction. Formatting is managed by Prettier; linting uses ESLint with TypeScript type-aware rules.

## Testing Guidelines
Use Jest for unit and e2e tests. Name unit tests `*.spec.ts` next to the file under test, and keep e2e specs as `*.e2e-spec.ts` under `test/`. Add or update tests when changing services, controllers, guards, middleware, or transaction workflows. Run `npm test` before small changes and `npm run test:e2e` when API behavior or app wiring changes.

## Commit & Pull Request Guidelines
Recent history uses short imperative commits such as `fix T08`, with occasional conventional messages like `fix: improve secret reveal polling and pending tx recovery`. Keep commits concise and reference task IDs when available. Pull requests should include a summary, test results, linked issue or task, and screenshots or logs only when behavior is visible externally.

## Security & Configuration Tips
Do not commit secrets. `.env`, `ssmvalues.json`, and Firebase service account JSON files are gitignored. Use `ssmvalues.json.example` as the template, then run `./setssmparameter.sh` or `./fetch-ssm.sh` with the intended AWS profile. Use `SecureString` for sensitive SSM parameters.
