# mail_box_indexer_client — AI Development Guide

> **Git policy — never auto-commit or auto-push.** Leave work in the working tree.
> Run `git commit` / `git push` / `gh pr create` / `scripts/push_all.sh` **only when the
> user explicitly asks in that turn**. Finishing a task is not permission to commit it.
> Do not create feature branches; stay on the current branch.

## What this is

`@sudobility/indexer_client` — TypeScript client library for the 0xMail blockchain mail
indexer REST + GraphQL APIs. Ships an `IndexerClient` class, TanStack React Query hooks,
and admin/GraphQL/webhook helper classes. Pure library (no app entry point); published to
npm as ESM. Works on React 18+/19 and React Native.

- Module type: **ESM** (`"type": "module"`); `main: dist/index.js`, `types: dist/index.d.ts`.
- License: BUSL-1.1.
- Package manager: **Bun** — always use `bun`, never `npm`/`yarn`. Lockfile is `bun.lock`.
- `@sudobility/*` deps resolve from GitHub Packages (`.npmrc`: `@sudobility:registry=https://npm.pkg.github.com`); install needs a token with `read:packages`.

## Commands (verified against package.json)

```bash
bun install
bun run build              # tsc -p tsconfig.build.json, THEN node scripts/fix-esm-imports.mjs
bun run build:watch        # tsc --watch
bun run clean              # rm -rf dist
bun run typecheck          # tsc --noEmit
bun run lint               # eslint src --ext .ts,.tsx   (+ lint:fix)
bun run format             # prettier --write src/**/*.ts (+ format:check)
bun run test:run           # vitest run (unit); test:unit is an identical alias
bun run test:watch         # vitest --watch
bun run test:coverage      # vitest run --coverage (v8, 70% thresholds)
bun run test:integration   # vitest with vitest.integration.config.ts (live backend)
bun run check-all          # lint && typecheck && test:unit
bun run verify             # check-all && build  (run before publishing)
bun publish                # prepublishOnly auto-runs clean + build
```

There is **no `test` script** — `bun run test` fails. Use `test:run`/`test:unit`/`test:watch`.

## Gotchas / non-obvious

- **Post-build ESM fixer is mandatory.** `tsc` runs under `moduleResolution: "bundler"` and
  emits extensionless relative imports (`from './core'`) that Node's native ESM loader
  rejects. `scripts/fix-esm-imports.mjs` rewrites them to `./core/index.js` / `./x.js`. It
  is part of `build`; never ship a `tsc`-only build. The script is idempotent and
  dependency-free; unresolved specifiers are warnings, not failures.
- **Integration tests need a live backend.** Set `INTEGRATION_TEST_INDEXER_URL` in `.env.test`
  (see `.env.example`). NOT `INDEXER_BACKEND_URL`. They run serially (threads/isolate off,
  30s timeout) and are excluded from unit runs.
- **TypeScript 6** (`~6.0.3`); `tsconfig.json` sets `ignoreDeprecations: "6.0"`. Fully strict
  (incl. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`).
  Target ES2020, module ESNext, `jsx: "react"` (classic transform).
- Build emits `.js` + `.d.ts` + `.d.ts.map` + source maps into `dist/`. Tests are excluded
  from the build via `tsconfig.build.json`.

## Architecture (three layers + helpers)

1. **Network** — `src/network/IndexerClient.ts`: thin REST client, one method per endpoint.
   Each: build headers → `networkClient.get/post/put/delete` → check `response.ok` →
   `handleApiError` on failure. Constructor `(endpointUrl, networkClient, dev?)`.
2. **Business** — `src/business/indexer-service.ts`: `IndexerService` singleton wrapping
   public-only endpoints with a 5-min in-memory TTL cache (`getLeaderboard`,
   `getPublicStats`, `clearCache`).
3. **Hooks** — `src/hooks/`: one file per endpoint. Cacheable GETs use `useQuery`; on-demand
   / POST calls use `useMutation`. All hooks take `(networkClient, endpointUrl, dev, ...params)`.
   `useIndexerMail` and `useIndexerPoints` (combined) are **deprecated** — use the individual
   hooks. `IndexerMockData` (`mocks.ts`) provides static response factories for tests.

**Helpers** — `src/utils/`: `IndexerAdminHelper`, `IndexerGraphQLHelper`,
`IndexerWebhookHelper`, built via `createIndexerAdmin/GraphQL/Webhook` or
`createIndexerHelpers(config, networkClient)` → `{ admin, graphql, webhook }`. Header builders
`createAuthHeaders` / `createHeaders`, plus `buildUrl` / `handleApiError` live in
`indexer-helpers.ts`.

**Errors** — `src/errors.ts`: `IndexerError` base (`.operation`, `.statusCode`) with
subclasses `IndexerAuthError`, `IndexerNetworkError`, `IndexerValidationError`,
`IndexerRateLimitError`, `IndexerServerError`. All re-exported from `src/index.ts`.

### Dependency injection (key design point)

The library never imports a concrete HTTP client. Every network call goes through the
`NetworkClient` interface from `@sudobility/types`, supplied by the consuming app's DI
container (`@sudobility/di`). This is what enables one codebase for React Native + web + Node.
For tests, consumers inject `MockNetworkClient` from `@sudobility/di/mocks`.

### Authentication

- **Public** endpoints: `createHeaders(dev)`.
- **Signature-protected**: require `IndexerUserAuth` = `{ message, signature, signer }`
  (wallet-signed); `createAuthHeaders(auth, dev)` sets `x-signature`, `x-message`
  (URI-encoded), `x-signer`. Protected `useQuery` hooks gate on
  `enabled: !!walletAddress && !!auth.signature && !!auth.message`.
- **Admin** endpoints: `x-admin-signature`. **Dev mode** (`dev=true`): adds `x-dev: true`.

### TanStack Query conventions

- Query keys `['indexer', '<entity>', ...params]`.
- Stale times ~2 min for volatile data (leaderboard, points info), ~5 min for stable data.

### GraphQL

`IndexerGraphQLHelper` POSTs raw query strings to `{baseUrl}/graphql`, supports `WhereInput`
filtering + `PaginationInput` (`first`, `skip`, `orderBy`, `orderDirection`). Convenience
methods (`getMailsFromAddress`, `getActiveDelegationsFromAddress`) wrap the generic queries.

## Adding an endpoint (typical flow)

1. Add method to `IndexerClient.ts` (same header → call → `response.ok` → `handleApiError` pattern).
2. Add/import request+response types; export new types from `src/network/index.ts`.
3. New hook `src/hooks/useIndexer<Name>.ts` (`useQuery` cacheable / `useMutation` on-demand;
   `(networkClient, endpointUrl, dev, ...params)` signature). Export it from `src/hooks/index.ts`.
4. Add a mock factory in `mocks.ts` and tests under the relevant `__tests__/`.

## Layout

```
src/
  index.ts              # re-exports network, business, hooks, utils, errors, types
  types.ts              # IndexerUserAuth
  errors.ts             # error hierarchy
  network/              # IndexerClient + response/request types
  business/             # IndexerService (cached public endpoints)
  hooks/                # one hook per endpoint + mocks.ts + __tests__/
  utils/                # admin / graphql / webhook helpers, factories, header builders
  __integration__/      # live-backend integration tests (see its README.md)
docs/                   # extended guides (API.md, HOOKS_DOCUMENTATION.md, EXAMPLES.md, …)
scripts/fix-esm-imports.mjs
```

Unit tests live in `__tests__/` beside source (Vitest + happy-dom, globals on). More detail:
`docs/` and `src/__integration__/README.md`.
