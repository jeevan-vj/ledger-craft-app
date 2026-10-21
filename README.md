# EasyBizInvoice

EasyBizInvoice (repository `ledger-craft-app`) is the invoicing and business-management app. The web client is a Vite PWA on Cloudflare Pages. The API is Hono with Better Auth, deployed as a Cloudflare Worker that stores data in SQLite-backed Durable Objects. The Expo app lives in `mobile/`.

Production site: https://easybiz.iamjeevan.com

Pages project `ledger-craft-app` also serves https://ledger-craft-app.pages.dev. The Worker is `ledgercraft-api` at https://ledgercraft-api.jeevan90wijerathna.workers.dev. The Pages Function `functions/api/[[path]].ts` proxies `/api/*` to that Worker.

## Stack

| Piece | What the repo uses |
| --- | --- |
| Web | React 18, TypeScript, Vite 5, Tailwind CSS, React Router, TanStack Query, `vite-plugin-pwa`. Source is `src/`. |
| API | Hono, Better Auth, Drizzle, Zod. Package `@ledgercraft/api` in `api/`. Local development uses Node's SQLite driver (`api/src/db/local.ts`). Production uses one Identity Durable Object for auth and one Ledger Durable Object per organisation (`deploy/api/wrangler.jsonc`). |
| Contracts | `@ledgercraft/contracts` in `packages/contracts` (Zod DTOs). The web app depends on it with `workspace:*`. |
| Mobile | Expo SDK 54 (`expo` `~54.0.20`), React Native 0.81.5, `@sentry/react-native` `~7.2.0`, in `mobile/`. Installed display name `easybizinvoice`. |
| Workspace | pnpm `11.19.0` (`package.json` `packageManager`). `pnpm-workspace.yaml` includes `api` and `packages/contracts`. `mobile/` is outside the workspace and uses npm. |

Reviewed SQLite SQL is in `api/sqlite-migrations/`. Deployment details, including what the free Cloudflare plan does and does not include, are in `deploy/cloudflare.md`. `docs/CLOUDFLARE_DEPLOYMENT.md` points at that runbook.

## Monitoring

Web browser errors go to Sentry when `VITE_SENTRY_DSN` is set at build time. Setup, source maps, and the verification checklist are in `docs/sentry-web.md`. The SDK is `@sentry/react`. With no DSN, the production bundle omits it.

The API Worker reports unhandled errors with `@sentry/cloudflare` when `SENTRY_ENVIRONMENT` is `production`. The public DSN is `SENTRY_DSN` in `deploy/api/wrangler.jsonc`. Organisation `ledgercraft`, project `ledgercraft-api`. The behaviour, scrubbing rules, and the one-off debug route are in `deploy/cloudflare.md` under "Error monitoring (Sentry)".

The Expo app reports native crashes and JavaScript errors with `@sentry/react-native`. Preview and production profiles in `mobile/eas.json` set `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_ORG=ledgercraft` (project `ledgercraft-mobile`). Local Expo, Jest, CI, and the development profiles leave the DSN unset. EAS uploads source maps only when the optional `SENTRY_AUTH_TOKEN` secret is present. Setup is in [`mobile/SENTRY.md`](mobile/SENTRY.md).

Cloudflare Worker observability is also enabled in `deploy/api/wrangler.jsonc`.

## Install

Web CI uses Node 22. Mobile CI uses Node 20. `pnpm deploy:check`, `pnpm deploy:cloudflare`, and `.github/workflows/release.yml` require Node.js 24 or newer.

From the repository root, with the pnpm version pinned in `package.json`:

```bash
pnpm install --frozen-lockfile
```

The workspace lockfile is `pnpm-lock.yaml`. `mobile/package-lock.json` is the npm lockfile for the Expo app.

```bash
cd mobile
npm ci
```

## Run the web app and API

`pnpm db:migrate` applies `api/sqlite-migrations/` to the local SQLite file only. `api/src/env.ts` uses `DATABASE_URL`, or `.data/ledgercraft.sqlite` when that variable is unset. Pass an absolute path so the API and the migrator open the same file:

```bash
DATABASE_URL=/absolute/path/ledgercraft.sqlite pnpm db:migrate
DATABASE_URL=/absolute/path/ledgercraft.sqlite pnpm dev:api
pnpm dev
```

`pnpm dev:api` listens on `127.0.0.1:3001` (`API_PORT` overrides the port). `pnpm dev` starts Vite on port 8080 and proxies `/api` to `127.0.0.1:3001` (`vite.config.ts`).

`.env.example` still lists Postgres URLs on port 55432. Those match `pnpm db:up` and `scripts/dev.sh`. The Node API opens SQLite, so a Postgres `DATABASE_URL` is the wrong file for `pnpm dev:api`. `pnpm dev:stack` and `pnpm start` both run `scripts/dev.sh`, which starts that Docker Postgres stack and then the API and Vite.

To exercise the Worker and Durable Objects locally:

```bash
pnpm exec wrangler dev --config deploy/api/wrangler.jsonc
```

A development Better Auth secret belongs in Wrangler's local secret file. `deploy/cloudflare.md` describes that setup. Production `BETTER_AUTH_SECRET` stays on the Worker.

## Run the mobile app

```bash
cd mobile
npm start
npm run ios
npm run android
```

`EXPO_PUBLIC_API_URL` defaults to `http://127.0.0.1:3001` in `mobile/src/features/auth/api/http.ts`. Android emulator and device hosts are noted in `.env.example`.

Business Settings → Appearance edits the invoice palette. It offers the same six web presets (blue, purple, green, red, pink, slate) and hex fields for primary, secondary, accent, text, light text, background, and surface, with a live preview. Invalid hex is rejected. Save calls `updateBusinessProfile({ theme })` with the contract colours only.

Invoice preview and PDF HTML use that saved theme. `resolveInvoiceTheme` (`mobile/src/utils/invoiceTheme.ts`) fills missing or invalid colours from the mobile default palette, including background `#F5F6F3`. The classic, modern, minimal, executive, corporate, and modern pro templates use those tokens. Text on a brand fill switches to dark ink when white would be unreadable.

## Test

Web and shared packages, from the repository root:

```bash
pnpm test:run
pnpm test:api
pnpm test:contracts
pnpm type-check
pnpm type-check:api
pnpm lint
pnpm test:e2e
```

`pnpm test` starts Vitest in watch mode. `pnpm test:e2e` runs Playwright with `baseURL` `http://localhost:8080` (`playwright.config.ts`). `pnpm verify:w1` runs contract tests, API tests, and the API plus contracts typecheck. `verify:w2` through `verify:w13` in `package.json` alias that same command.

Mobile, from `mobile/`:

```bash
npm test
npm run lint
npm run type-check
```

Pull-request CI (`.github/workflows/ci.yml`) installs with `pnpm install --frozen-lockfile` on Node 22 and runs web lint, `tsc` for `tsconfig.app.json` and `tsconfig.node.json`, `pnpm test:run`, and `pnpm build`. The mobile job uses Node 20, `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test -- --ci --watchAll=false`, and `npx expo export --platform ios` with `SENTRY_DISABLE_AUTO_UPLOAD=true`. Mobile lint, typecheck, and Jest fail the job directly. Web lint and web typecheck still compare error counts with baselines in that workflow. The release-readiness job runs `node --test .github/scripts/verify-api-readiness.test.mjs`.

## Deploy

Local validation, then a real release. Both require Node.js 24 or newer and an authenticated Wrangler session. `pnpm deploy:check` does not change production.

```bash
pnpm install --frozen-lockfile
pnpm run deploy:check
pnpm run deploy:cloudflare
pnpm run deploy:help
```

`pnpm deploy:cloudflare` checks the repo, deploys the Worker, publishes Pages, and runs the live checks described in `deploy/cloudflare.md`. It preserves an existing `BETTER_AUTH_SECRET`.

Schema changes start in `api/src/db/schema/`, then:

```bash
pnpm db:generate --name describe_the_change
```

Review the new SQL in `api/sqlite-migrations/` and leave already-deployed files unchanged. `pnpm db:migrate` applies that SQL to local SQLite. Production Durable Objects apply the bundled files when each object next starts.

Pushes to `main` also run `.github/workflows/release.yml`, which builds the web app, deploys the Worker and Pages, uploads Sentry source maps when `SENTRY_AUTH_TOKEN` is set, and checks API readiness. See `docs/sentry-web.md` and the Sentry section of `deploy/cloudflare.md`.

Android store builds from `mobile/`:

```bash
npm run build:android
npm run submit:android
```

Preview and development profiles are `npm run build:android:preview` and `npm run build:android:development`. iOS release steps are in `.cursor/skills/ledgercraft-mobile-release/SKILL.md`.
