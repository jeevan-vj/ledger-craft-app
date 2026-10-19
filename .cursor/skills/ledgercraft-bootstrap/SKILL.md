---
name: ledgercraft-bootstrap
description: Start-here operating instructions for LedgerCraft reconstruction. Use at the beginning of any session, when verifying W1, continuing W2+, launching specialist agents, or when the user mentions reconstruction, Hono, verify, pnpm workspace, or lost database.
---

# LedgerCraft bootstrap

Read this before writing code. Then follow the named skill for the wave you are on.

## You are here (2026-10-18)

The active deployment is Cloudflare Pages plus a Hono Worker, with Identity and
per-organisation Ledger SQLite Durable Objects. The PostgreSQL reconstruction
table below is historical context only; do not start Docker or Postgres for the
current architecture.

| Fact | Detail |
| --- | --- |
| Mobile invoice sharing | **Implemented locally (2026-10-19).** Expo separates public-link sharing, PDF download/export and PDF sharing; public tokens have an unauthenticated native route plus web fallback. iOS Associated Domains/AASA use the build-5 Team ID. Android intent routing is configured, while production `assetlinks.json` and signed-device QA await the first Android signing credential. Strict TypeScript, 23 Jest suites (89 tests), lint with no errors and iOS/Android exports pass. |
| Live `public` schema | Empty. `auth.users` = 0. Storage empty. Data gone. |
| Identity cutover | Skip UUID preservation. No users to import. |
| W0 | Done (skills, rules, docs). |
| W1 | **Verified.** `pnpm verify:w1` is green (contracts, health/RLS, typecheck). Migrator needs `CREATE` on the database so Drizzle can create the `drizzle` schema. |
| W2 | **Verified.** `pnpm verify:w2` green. Compatibility product schema on `55432`. |
| W3 | **Verified (2026-09-05).** `pnpm verify:w3` green. Better Auth email/password, `/api/me` binds org. |
| W4 | **Verified (2026-09-07).** `pnpm verify:w4` green. Customers CRUD via Hono. |
| W5 | **Verified (2026-09-08).** `pnpm verify:w5` green. Invoice idempotency + share tokens. |
| W6 | **Verified (2026-09-08).** `pnpm verify:w6` green. Expenses, payments, `GET /api/accounts`. |
| W7 | **Verified (2026-09-09).** `pnpm verify:w7` green. Bank accounts, transaction import, recon persist, tax config/returns. |
| W8 | **Verified (2026-09-09).** `pnpm verify:w8` green. Objects, payment receipts, Resend/logging mailer, receipt-scan AI. |
| W9 | **Verified (2026-09-10).** `pnpm verify:w9` green. Conversations Hono, Query-backed `useAppData`, reporting forks. |
| W10 | **Done (2026-09-11).** Tax/IRD/GST period aliases; auth callback/confirm/classic signup off Supabase Auth. |
| W11 | **Verified (2026-09-11).** Journals CRUD, account writes/initialize, invoice remind mailer. |
| W12 | **Verified (2026-09-11).** `POST /api/ai/chat`; client OpenAI gone. |
| W13 | **Verified (2026-09-11).** `@supabase/supabase-js` removed; hosted URL/anon key and Edge Function URLs gone. |
| GST filing | **Deployed (2026-10-03).** Hono/SQLite persists IRD + reconciliation snapshots; a dedicated action records the external myIR confirmation reference; PDF export and authenticated create/save/download/file/reload browser QA pass. Frontend `714caea84c59`, Worker `77d9125d-f89c-44fb-9ec2-1d50ad1c7603`; no migration. |
| AKP-01 | **Partially implemented and deployed (2026-10-04).** Vendor CRUD and web bill draft/receive/void/payment workflows, exact AP journals, and SQLite migration `0004_purchases-payables.sql` pass the production release gate. Expo vendor/bill browsing, draft create/edit, receive/void and payment-critical flows pass focused tests, iOS/Android exports, and EAS production iOS archive build 2 (`170b1d99-61c0-4616-8ccd-e3a111c10f21`). Submission `1b89f039-ccbc-4af5-8e7f-81874f082f54` was uploaded to App Store Connect for TestFlight; Apple processing, authenticated device QA, attachments and the remaining lifecycle/import/recurring scope are pending. |
| Mobile hardening | **Verified locally (2026-10-19).** Honest load failures, dirty-bill navigation protection, accessible swipe actions and inputs, exact purchase formatting/totals/payment validation, and React Native query lifecycle are integrated with the Wise dark theme and Home / Invoices / Customers / More navigation. All 17 Jest suites (69 tests), strict TypeScript, lint with no errors, and iOS/Android production exports pass. Authenticated native device QA and the missing parity domains remain pending. |
| Mobile customers | **Implemented locally (2026-10-19).** Native create/detail/edit/delete-attempt flows, invoice history and exact outstanding summaries, contact actions, customer-prefilled invoice creation, and dirty-form protection use Hono. Strict TypeScript, 17 Jest suites (69 tests), and lint with no errors pass; authenticated device QA remains pending. |
| Mobile items | **Implemented locally (2026-10-19).** Native item list/filter, create/detail/edit/delete-attempt, active-state, category and price/tax-default workflows use Hono. Exact decimal text is preserved through item form/API requests. Strict TypeScript, 18 Jest suites (72 tests), lint with no errors, and iOS/Android production exports pass; authenticated device QA remains pending. |
| Mobile banking | **Implemented locally (2026-10-19).** Native bank-account list/filter, create/detail/edit/delete-attempt, active-state, exact balance fields, and imported transaction history use Hono. Strict TypeScript, 20 Jest suites (78 tests), lint with no errors, and iOS/Android production exports pass; authenticated device QA and the remaining AKP-02 workflows are pending. |
| Mobile layout safety | **Verified locally (2026-10-19).** One root safe-area provider, automatic large-title list insets, shared measured native-tab clearance, a measured invoice-detail action footer, fit-to-width A4 WebView metadata, and a semantic-theme template selector are in place. Strict TypeScript, all 21 Jest suites (81 tests), lint with no errors, and iOS/Android production exports pass. Native visual QA remains pending because no local iOS simulator runtime is installed and EAS Simulator is unavailable for the account. |
| Git | `origin/mobile-app` includes W4 customers. Working tree also has web Better Auth plus Hono through W13. |
| Clients | Web and mobile email login/signup → Better Auth (`/api/auth/*`). Product CRUD including journals, account writes, reminders, receipt-scan, and chat → Hono. `@supabase/supabase-js` is not installed. |

## Pickup

1. Read `AGENTS.md`, `TARGET_ARCHITECTURE.md`, and `AKAUNTING_FEATURE_PARITY_BACKLOG.md`.
2. Continue the dependency-ordered AKP tasks; finish the remaining AKP-01 scope or begin AKP-02 only as a separate verified slice.
3. For EAS iOS builds, TestFlight, or App Store Connect work, read `ledgercraft-mobile-release` before acting.
4. Commit, push, or deploy only when the user asks.

## First command

```bash
pnpm install
pnpm db:migrate
pnpm deploy:check
```

If `pnpm-lock.yaml` changes, preserve and review it. Dev smoke:

```bash
pnpm dev:api          # 127.0.0.1:3001
pnpm dev              # Vite :8080, proxies /api
curl -s localhost:8080/api/healthz
curl -s localhost:8080/api/me
```

## Env and ports

See `.env.example`.

| Name | Value |
| --- | --- |
| SQLite | Local `DATABASE_URL` only for `pnpm db:migrate`; production uses Ledger Durable Objects. |
| `API_PORT` | `3001` |

Reviewed SQL lives in `api/sqlite-migrations/`, is checksum tracked, and applies
transactionally on Durable Object startup. Never rotate the signing secret
implicitly.

## Layout (do not move yet)

```text
src/                     web (Vite). Stays here until W9.
mobile/                  Expo. Not in the pnpm workspace yet.
api/                     Hono + Drizzle + tests
packages/contracts/      Zod DTOs only
docker/postgres/init/    roles
api/sqlite-migrations/   reviewed, checksum-tracked SQLite migrations
TARGET_ARCHITECTURE.md   end-state spec
AGENTS.md                this project’s agent guide
.cursor/skills/          procedures
.cursor/rules/           always-on gates
```

Do not move `src/` → `apps/web` or `mobile/` → `apps/mobile` until every protected path uses Hono.

## Skill index (read the one that matches the work)

| Skill | When |
| --- | --- |
| `ledgercraft-architecture` | Any API, DB, auth, storage, email, AI |
| `ledgercraft-tdd` | Implementing or testing a slice |
| `ledgercraft-verify` | Prove a feature/wave works (tests + live HTTP) |
| `ledgercraft-verify-ui` | Browser clicks, screenshots, invoice PDF |
| `ledgercraft-web-ui` | Web React/Tailwind design and visual QA |
| `ledgercraft-mobile-ui` | Expo/React Native design and device QA |
| `ledgercraft-mobile-loop` | Repeated mobile backlog selection, implementation, verification, PR, and wait cycle |
| `ledgercraft-schema-rebuild` | Tables, Drizzle, RLS, compatibility schema |
| `ledgercraft-vertical-slice` | Cutting over one domain to Hono |
| `ledgercraft-agent-roster` | Launching Task subagents |
| `ledgercraft-knowledge-sync` | End of a wave or when docs drift |

## Agent roster (short)

Parent chat = Orchestrator. Task `generalPurpose` + prompt in `ledgercraft-agent-roster`.

| Next wave | Launch |
| --- | --- |
| Finish W1/W2/W3/W4 | Done (`pnpm verify:w4`) |
| W5 | Invoice idempotency + share (`pnpm verify:w5`) |
| W6 | Payments, expenses, accounts list (`pnpm verify:w6`) |
| W7 | Bank, recon, tax (`pnpm verify:w7`) |
| W8 | Storage, email, AI (`pnpm verify:w8`) |
| W9 | Client consolidation (**verified**, `pnpm verify:w9`) |
| W10 | Leftover-screen rewire (**done**) |
| W11 | Journals, accounts write, reminder mailer (**verified**) |
| W12 | Chat completions behind Hono (**verified**) |
| W13 | supabase-js burn (**verified**) |

## Hard no

- Replay `supabase/migrations` or `migrations/*.sql` in order
- `api/vendor` or unpkg vendoring
- New client `supabase.from`, Storage SDK, Edge Function, `VITE_OPENAI_*`
- Better Auth + Supabase sessions both authorizing data
- UI redesign + TanStack Router + `apps/` move + data cutover in one change
- Mock Drizzle in SQL/RLS/transaction tests
- Mix UI redesign, TanStack Router, `apps/` moves, and a data cutover
- Commit unless the user asked

## After any change

Run `ledgercraft-knowledge-sync`. Write present-tense facts in `TARGET_ARCHITECTURE.md` and `AGENTS.md`.
