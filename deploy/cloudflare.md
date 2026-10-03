# Cloudflare deployment

The `mobile-app` branch targets Cloudflare's free plan. Pages serves the Vite
frontend (`ledger-craft-app`); the `ledgercraft-api` Worker routes Hono requests
to SQLite-backed Durable Objects. One Identity object owns Better Auth users,
unique emails and sessions. Each organisation has a separate Ledger object for
its accounting records and attachments. The authenticated gateway chooses the
organisation object; client-supplied tenant IDs do not grant access.

This is the approved replacement for the earlier container/PostgreSQL proposal.
It uses no D1, paid Containers, R2, PostgreSQL, Supabase, external email service,
or external AI service. Durable Objects provide the transaction boundary and
CPU budget needed by accounting operations and secure password hashing. Money
is stored as decimal TEXT and calculated with exact server decimal helpers.
Attachments are stored in SQLite with a 1 MB size limit; PDFs can be generated
and downloaded by the client. Email delivery and AI features are unavailable in
this deployment; they must not claim successful delivery or generation.

**Latest release (2026-10-03): purchases/payables deployed and verified.**

- Website: https://easybiz.iamjeevan.com
- Pages deployment: https://eb7d93c7.ledger-craft-app.pages.dev
- Frontend: `2fb57d9d033e`, version 0.0.8.
- Worker: `383a4429-5305-412d-b95b-70ac37cb2bd6`.
- Migration: `0004_purchases-payables.sql`; readiness reports it applied.
  The additive migration creates tenant-scoped vendors, bills, bill lines and
  bill payments with exact-decimal checks and composite tenant foreign keys.
- Source commit: `b97b09e` on `mobile-app`; no Git push was requested.
- `pnpm deploy:cloudflare` exited zero: 50 contract and 77 API tests, SQLite
  validation, API/contracts/Worker typechecks, the production build, Pages
  Functions compile and Worker dry run passed.
- Live smoke checks passed readiness, signup/session, tenant isolation, exact
  invoice totals, named-charge save/reopen/remove, concurrent invoices,
  rollback, idempotency, attachments, public sharing, sign-out/sign-in and
  persistence. The existing signing secret was preserved.
- Local authenticated Browser verification covered vendor create/search/edit/
  reload, bill draft/edit/receive/void, exact GST totals, overpayment rejection,
  partial/final payment, reload persistence, and 390px responsive layouts. The
  production canonical Browser session signed in and out successfully, but its
  installed PWA shell remained on build `1a996c`; Force Refresh was not used
  because it clears browser caches and local storage. Production metadata and
  the freshly published Pages artifact report `2fb57d9d033e`.

**Earlier release (2026-10-03): expense flow repair deployed and verified.**

- Website: https://easybiz.iamjeevan.com
- Pages deployment: https://58800acb.ledger-craft-app.pages.dev
- Frontend: `1a996cac23f2`, version 0.0.8.
- Worker: `6b5c99a4-7df6-4a91-8cfb-493b88708c97`.
- Migration: `0003_expense_gst_treatment.sql`; readiness reports it applied.
  Existing expense rows are preserved with standard/none/100/0 GST defaults.
- `pnpm deploy:cloudflare` exited zero: 46 contract and 75 API tests, SQLite
  validation, API/contracts/Worker typechecks, the production build and Worker
  dry run passed.
- Live smoke checks passed readiness, signup/session, tenant isolation, exact
  invoice totals, named-charge save/reopen/remove, concurrent invoices,
  rollback, idempotency, attachments, public sharing, sign-out/sign-in and
  persistence. The existing signing secret was preserved.
- An isolated production browser session verified build `1a996c`, accessible
  amount/tax inputs, NZD formatting, expense create/edit/reload, Approved status,
  and persisted Partial / Entertainment (50%) / 50% GST fields. The synthetic
  account signed out afterward. The existing Chrome profile still showed the
  prior PWA shell, so its caches and local storage were left untouched.
- Source changes remain uncommitted in the `mobile-app` checkout.

**Earlier release (2026-10-02): web and mobile design systems deployed and verified.**

- Website: https://easybiz.iamjeevan.com
- Pages deployment: https://c2dc7d87.ledger-craft-app.pages.dev
- Frontend: `ad2aaea114f0`, version 0.0.8.
- Worker: `d8bff048-7d26-48e1-8384-18b6d3031ac8`.
- Source commit: `3bfbffb` on `mobile-app`; the GitHub push is pending an
  authorized repository credential after the configured account returned 403.
- No new SQL migration; readiness remains `0002_business_bank_details.sql`.
- `pnpm deploy:cloudflare` exited zero: 45 contract and 75 API tests, SQLite
  validation, API/contracts/Worker typechecks, the production build and Worker
  dry run passed.
- Live smoke checks passed readiness, signup/session, tenant isolation, exact
  invoice totals, named-charge save/reopen/remove, concurrent invoices,
  rollback, idempotency, attachments, public sharing, sign-out/sign-in and
  persistence. The existing signing secret was preserved.
- Chrome verified synthetic signup, the authenticated dashboard, sign-out and
  the fresh Pages artifact at desktop and 390px mobile widths. The canonical
  custom-domain tab retained the previous `934e59` service-worker shell despite
  `/version.json` serving `ad2aaea114f0`; the preview artifact loaded the new
  `index-BCJbg-nm.js` bundle without an update prompt. No customer data changed.

**Earlier release (2026-09-15): invoice sharing deployed and verified.**

- Website: https://easybiz.iamjeevan.com
- Pages deployment: https://6674884d.ledger-craft-app.pages.dev
- Frontend: `934e59362a4f`, version 0.0.8.
- Worker: `26e32c83-ab9f-4eb7-a264-65ecb0d61595`.
- No new SQL migration; readiness remains `0002_business_bank_details.sql`.
- Source commit: `df5508e`; generated version and release evidence are recorded
  in the following metadata commit.
- `pnpm deploy:cloudflare` exited zero: 45 contract and 75 API tests, SQLite
  validation, API/contracts/Worker typechecks, production build and dry run pass.
  The existing standalone web typecheck blocker in
  `src/services/__tests__/aiService.test.ts:21` remains outside this release.
- Live smoke checks pass readiness, authentication, tenant isolation, invoice
  totals/charges, concurrency, rollback, idempotency, attachments, public sharing
  and persistence. The signing secret is preserved.
- Production Chrome verification uses a separate synthetic account: generates
  a link in the invoice list, opens it in a logged-out recipient context, reloads,
  downloads a valid 142,244-byte PDF, checks a 390px mobile viewport, and rejects
  expired/invalid links. The PDF is visually checked against the preview,
  including tax, delivery, bank details, notes and terms. The synthetic owner
  signs out afterward. Customer records are not changed.
- Evidence: `/tmp/ledgercraft-sharing-prod/` and
  `/tmp/ledgercraft-sharing-production-release.log`.

**Earlier release (2026-09-14): invoice bank details deployed and verified.**

- Website: https://easybiz.iamjeevan.com
- Pages deployment: https://75c4989e.ledger-craft-app.pages.dev
- Frontend: `c6c95ec1a8fe`, version 0.0.8.
- Worker: `71f96f39-7989-4f34-a9a3-a093034b19df`.
- Migration: `0002_business_bank_details.sql`; readiness reports it applied.
  The migration adds two nullable text columns. Existing migrations remain
  checksum-tracked; inactive tenant objects migrate on their next startup.
- `pnpm deploy:cloudflare` exited zero. All 45 contract and 75 API tests,
  SQLite validation, API/contracts/Worker typechecks, build and dry run passed.
- Live smoke checks passed authentication, tenant isolation, invoice totals,
  named charges, concurrency, rollback, idempotency, attachments, sharing and
  persistence.
- Chrome on the production custom domain verified bank settings save/reload,
  invoice reload, visible build `c6c95e`, and downloaded PDF with both separate
  account rows. Verification used a synthetic account and signed out afterward.
  Evidence: `/tmp/ledgercraft-bank-prod/`. Customer records were not modified
  by the verification flow.
- Source commits: `527b963` and `ecec12a`; release metadata is recorded afterward.

**Earlier release (2026-09-14): deployed and verified.**

- Website: https://easybiz.iamjeevan.com
- Pages deployment: https://3324259f.ledger-craft-app.pages.dev
- Frontend build: `6849a8db7473` (production, version 0.0.8).
- Worker: `ledgercraft-api`, version `ab83b548-acf0-4c8b-a05b-d8dcdd33dd92`.
- 43 contract tests and 74 API tests passed; web/API/Worker type checks and the
  SQLite schema/constraints checks passed.
- Live checks through the website passed signup, sessions, tenant isolation,
  invoice totals, concurrent numbering, rollback, idempotency, attachments,
  public sharing, sign-out/sign-in and persistence.
- The repeatable script deployed the version-display fix and applied
  `0001_index_session_user.sql`; the live readiness migration header matched.
- Chrome verified existing-account login on the custom domain, the sidebar
  `v0.0.8` / `6849a8`, authenticated refresh and invoice navigation. A tab opened
  during publication briefly referenced an old dashboard chunk; reload loaded
  the current release successfully. The existing update banner can remain visible
  even on the current release; its notification behavior was not changed.
- A pre-deployment session survived Worker redeployment with the local signing
  secret file absent, proving the remote key was preserved.

The CLI's first readiness request needed propagation retries. Pages requires
`CLOUDFLARE_ACCOUNT_ID` in the deployment environment rather than `account_id`
in its TOML configuration; the repeatable script includes both corrections.
Synthetic verification accounts and records remain clearly named as checks.
Email, password-recovery email, Google OAuth and AI services are not configured.

## Setup

The primary website is https://easybiz.iamjeevan.com. Cloudflare Pages associates
this custom domain with `ledger-craft-app`; its DNS CNAME `easybiz` points to
`ledger-craft-app.pages.dev`. The Pages address remains available. Better Auth
uses the custom domain as its base URL and trusts both explicit HTTPS origins.
The deployment script verifies both addresses and runs authenticated smoke
checks using the custom domain as the request Origin. The smoke script derives
its Origin from the supplied URL unless `VERIFY_ORIGIN` is explicitly set.

Use Node.js 24 or newer (Node 26 is the tested local runtime) and the pnpm
version pinned in `package.json`. No Docker or hosted database is required.
Sign in to Cloudflare with `pnpm exec wrangler login`; complete authorization in
the browser. Configuration explicitly targets account
`c611a72b3bacd0c105ab864d7006fca7`.

The Pages project `ledger-craft-app` already exists. Wrangler creates or updates
the Worker and its SQLite Durable Object namespaces from
`deploy/api/wrangler.jsonc`. `wrangler.toml` contains Pages configuration and the
API proxy origin. The Pages production branch label remains `main` when
uploading this `mobile-app` checkout; the script does not merge, commit or push.

If `deploy/secrets.local.json` exists, the script reuses its validated
`BETTER_AUTH_SECRET`. Keep this Git-ignored file backed up securely. If the local
file is missing, the script first inspects the existing Worker's remote secret
names. When `BETTER_AUTH_SECRET` already exists remotely, deployment preserves
that secret without uploading a replacement. A new secret is generated only
when the initial secret is absent; failure to inspect the remote state stops
deployment. Losing a local file must never silently rotate the remote secret.
Do not regenerate a signing secret as part of a routine release: changing it
invalidates existing authentication state. Never place secrets in frontend
build variables.

## Code and database changes

For application changes only, run `pnpm deploy:cloudflare` from the repository.
It updates the existing resources listed below. Use `pnpm deploy:help` for the
command summary.

For database changes:

1. Edit the Drizzle definitions in `api/src/db/schema/`.
2. Run `pnpm db:generate --name describe_the_change`.
3. Review the new SQL in `api/sqlite-migrations/`. Keep already-deployed SQL
   files unchanged. Include generated metadata with the change.
4. Run `pnpm deploy:cloudflare`. This validates the migrations locally, bundles
   them, deploys the backend, and publishes and verifies the frontend.

`pnpm db:migrate` applies migrations to **local SQLite only**. Production uses
SQLite Durable Objects, so there is no separate D1 migration command. Each
object applies pending migrations transactionally when it next starts, before
serving its request; deployment does not wake every inactive organisation.
Use additive changes compatible with the previous frontend while backend and
frontend deployments roll out. A failed migration rolls back and prevents that
object from serving against a partially changed schema.

## Repeatable release

```bash
pnpm install --frozen-lockfile
pnpm run deploy:check
pnpm run deploy:cloudflare
```

`deploy:check` installs pinned dependencies, regenerates the bundled migration
manifest, runs API/contracts checks and the real SQLite baseline checks, builds
the frontend and Pages Function, typechecks the Worker, and runs Wrangler's
deployment dry run. It makes no production changes.

`deploy:cloudflare` performs those checks, confirms authenticated Cloudflare
access, deploys the Worker while preserving the signing secret, checks API readiness
and anonymous-access rejection, then deploys Pages. It verifies the published
frontend build marker and routes, and runs the authenticated smoke script.
A local lock prevents concurrent releases from the same checkout. If invoking
from multiple machines, coordinate releases outside that local lock. No GitHub
workflow is installed by this script.

Production entry points:

- [Website](https://ledger-craft-app.pages.dev)
- [API](https://ledgercraft-api.jeevan90wijerathna.workers.dev)

The Pages Function proxies `/api/*` to the Worker so browser authentication stays
on the Pages origin. Better Auth's URL and trusted origins match that origin.

## Migrations and local development

Reviewed SQLite SQL lives in `api/sqlite-migrations/*.sql`. The release script
bundles it with checksums. Each Durable Object applies pending migrations
inside `storage.transactionSync` when it starts, before serving requests, and
records the checksum. Before executing schema changes, it records recovery
bookmarks in `_migration_recovery` for migration recovery. A changed previously applied migration fails rather than being
silently replayed. Append new reviewed migration files; never edit an applied
file, replay the old PostgreSQL/Supabase SQL, or use `drizzle-kit push` against
production. Objects created later receive the same checked-in migration history.

Wrangler's `sqlite-v1` migration declares the Identity and Ledger SQLite
classes. It is separate from application table migrations. A successful Worker
upload does not prove that every inactive tenant has already been migrated;
each object applies the current history before serving its next request.
Keep future migrations compatible with rollout and recovery requirements.

For local Node API development, set `DATABASE_URL` to a SQLite filename or file
URL, then migrate and start the API. Use an absolute path to avoid workspace
working-directory ambiguity:

```bash
DATABASE_URL=/absolute/path/ledgercraft.sqlite pnpm db:migrate
DATABASE_URL=/absolute/path/ledgercraft.sqlite pnpm dev:api
pnpm dev
```

The API uses port 3001 and Vite uses 8080 with an `/api` proxy. Local Node SQLite
is useful for API testing; Wrangler local development exercises the production
Worker/Durable Object model:

```bash
pnpm exec wrangler dev --config deploy/api/wrangler.jsonc
```

Provide a development-only Better Auth secret through Wrangler's local secret
configuration. Never use production credentials in tests.

## Verification and free-plan limits

`node scripts/verify-cloudflare.mjs https://easybiz.iamjeevan.com` checks
synthetic signup/login, session rejection, cross-organisation isolation,
invoicing, rollback, concurrent numbering, idempotency, sharing and persistence.
It creates synthetic verification accounts and records; it does not send email.
Browser verification remains necessary to check the actual web flows and PDF
presentation. Record the release build marker, API version and verified flows.

The target is the free plan, not unlimited capacity. Cloudflare enforces free
request, CPU and storage quotas; service can stop at those limits. Do not enable
paid subscriptions or add a paid service as an implicit deployment step.

Platform references: [SQLite-backed Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
[Durable Objects free-plan pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

### Additional-charge fix (2026-09-14, published; live mutation verification pending)

Named invoice charges now cross the shared contract, web mapper and SQLite
repository. The server computes fixed/percentage active charges with exact
money helpers; empty lists clear charges. The web form retains legacy unnamed
charges and submits an empty list when charges are disabled. Existing SQLite
columns are reused; no schema migration is required.

Validation: 44 contract tests, 75 API tests, two web mapping tests, API/contracts
and Worker typechecks, real SQLite checks, frontend build and Wrangler dry run
pass (`pnpm deploy:check`). The broader web TypeScript check is blocked by an
existing syntax error at `src/services/__tests__/aiService.test.ts:21`.

Published frontend build `1b3eef9860bf` at
https://aa9f8b7c.ledger-craft-app.pages.dev and Worker version
`1b20615b-343e-4a6f-99e9-38fa157005d3`. The existing signing secret is preserved.
Live readiness returns `0001_index_session_user.sql`; no new migration was needed.
The canonical domain and Pages domain serve the matching build, healthy API,
login and home routes, and reject anonymous `/api/me`. Chrome authenticated
invoice navigation loaded build `1b3eef` after app Force Refresh and reload;
the verification account was signed out afterward. The update banner remains
visible despite the correct build marker.

The full release script was paused before publishing because automatic review
blocked synthetic production test-data creation. After `pnpm deploy:check`
passed and the user explicitly approved Wrangler OAuth, the checked Worker and
Pages artifacts were published directly with the script's Wrangler commands.
Only read-only live HTTP and browser checks ran; the expanded live mutation
smoke script has not run and still needs approval. No customer invoice edits
have occurred: those await the customer's authenticated browser session.
Do not report the requested invoices as corrected.
