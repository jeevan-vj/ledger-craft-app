---
name: ledgercraft-bootstrap
description: Start-here operating instructions for LedgerCraft reconstruction. Use at the beginning of any session, when verifying W1, continuing W2+, launching specialist agents, or when the user mentions reconstruction, Hono, verify, pnpm workspace, or lost database.
---

# LedgerCraft bootstrap

Read this before writing code. Then follow the named skill for the wave you are on.

## You are here (2026-10-18)

POS quick sale API is implemented locally (2026-10-27): `POST /api/sales` creates
the walk-in invoice, full payment, and receipt in one transaction. `Idempotency-Key`
is required. `GET /api/sales/summary` is not implemented. No migration.

Invoice-import Phase 2 is implemented locally (2026-10-26) through migration
`0019_invoice-import-phase2.sql`: guarded OpenAI/xAI/mock extraction, strict
review drafts, cent-level recomputation, duplicate/contact review, and atomic
draft invoice/bill commit with locked source documents. No client UI or posting
is included. See `docs/invoice-import/phase2.md`.

Invoice-import Phase 0 hardening is implemented locally (2026-10-26) through
`0017_invoice-import-phase0.sql`: explicit import/export and AI permissions,
real payments for paid imports, retained source attachments, external document
numbers, formula-safe CSV exports, and OpenAI-first Worker bindings (xAI optional).

The active deployment is Cloudflare Pages plus a Hono Worker, with Identity and
per-organisation Ledger SQLite Durable Objects. The PostgreSQL reconstruction
table below is historical context only; do not start Docker or Postgres for the
current architecture.

| Fact | Detail |
| --- | --- |
| AKP-00 | **Implemented locally (2026-10-23).** `docs/akaunting-core-capabilities.json` covers all 25 required comparison rows, separately records 11 optional extensions, and maps contract/API/web/mobile evidence or explicit gaps. `pnpm verify:akaunting-core:report` is the non-blocking CI inventory; `pnpm verify:akaunting-core` is strict and remains red until every required row is available. Baseline updates follow `docs/akaunting-parity-gate.md`. |
| AKP-04 | **Implemented locally (2026-10-23).** Migration `0016_recurring-scheduler.sql` adds tenant-scoped recurring invoice, bill, income, and expense templates with timezone-aware daily/weekly/monthly/annual/custom schedules, limits, pause/resume/end state, deterministic occurrence claims, retry history, and generated-record links. Ledger Durable Object alarms provide catch-up without a paid scheduler. Responsive web and Expo management/status UI are included. Email delivery remains honestly unavailable; deployment and authenticated native-device QA remain pending. |
| AKP-06 currency/localization | **Core document snapshots implemented locally (2026-10-23).** Migration `0015_currency-localization.sql` adds organisation localization/financial-year settings, a precision-aware catalogue, explicit dated immutable rates, and exact invoice/bill/expense plus base/foreign transfer snapshots. Web and Expo settings are present. Base-currency reports and AKP-05 exchange-difference journals remain open. |
| AKP-05 accounting reports | **Implemented locally (2026-10-23).** Migration `0013_server-authoritative-reports.sql` protects posted journals and indexes reporting reads. Exact postings cover invoices/payments, approved expenses, bank transactions/transfers, received bills/payments, and adjustments. Validated Hono reports provide trial balance, GL/account statement, P&L, balance sheet, cash flow, AR/AP aging, sales/purchase/tax summaries, cash/accrual periods, comparison, and relevant tenant filters. Responsive web and native Expo report workflows use the same server results. NZD is the only supported base currency until AKP-06; category filtering awaits journal-line category links. Authenticated native-device QA and deployment remain pending. |
| AKP-02 banking | **Implemented locally (2026-10-23).** Migration `0010_banking-parity-completion.sql` adds tenant-scoped exact-money splits, invoice/bill connections, and 1 MB attachment metadata. Web supports allocation, attachments, duplicate, printable/PDF detail, and CSV export. Expo supports native CSV selection, exact-text preview, duplicate skipping, and import. Focused contract/API/web/mobile tests, migration verification, and strict mobile TypeScript pass; authenticated native-device QA and deployment remain pending. |
| AKP-07 | **Implemented locally (2026-10-23).** Migration `0012_invoice-lifecycle.sql` adds invoice cancel/restore/archive, idempotent duplicate, immutable history, balanced reversal/restoration journals, exact line discounts/multiple taxes, private attachments with snapshot-scoped public access, CSV preview/apply/export, and printable detail across contracts, Hono/SQLite, responsive web, and Expo. Existing sharing/PDF/reminder behavior is preserved. Production email remains unavailable. |
| Invoice share links | **Implemented locally (2026-10-25).** `GET /api/invoices/:id/shares`, `POST /api/invoices/:id/shares/revoke`, and `POST /api/invoices/:id/share` with `{replace:true}` manage active links on the existing `shared_invoices` columns. A plain share reuses the newest active link for the same template. Revoked or expired public tokens return 410 `SHARE_INACTIVE`. Web and Expo public screens show that as an inactive link, with no retry and no generic load error. Unknown tokens stay not-found, also with no retry. Expo lists each active link with its created date and view count, confirms replace and revoke-all, and hides create, replace, revoke, send, and remind when the session lacks `invoices.write`. Dismissing the native share sheet is quiet. Public invoice and quote reads omit the session cookie and auth header. Shared PDFs are named `Invoice-<number>.pdf`. Send and Remind surface 503 `EMAIL_UNAVAILABLE` with the server message and a Share link instead action. An offline send or remind shows “Check your connection and try again.” and does not claim success. A failed mobile network call uses that connection copy instead of a local API start command. The mobile Sentry scrubber redacts those public tokens. No migration. Web requires explicit replacement for expiry changes and displays actual server expiry. Authenticated native-device sharing and signed Android link QA remain pending. |
| Quotes | **Implemented and verified locally (2026-10-23).** One quote entity (`kind` quote or estimate), `QUO-{YYYY}-{SEQ}` on its own sequence, 30-day default validity, share-link accept/decline, revise, duplicate, PDF export, and accepted-only conversion to a draft invoice. Tables are `quotes`, `quote_line_items`, and `shared_quotes` in `0007_quotes.sql`; quote writes do not post journals. Web routes are `/quotes` and `/shared/quote/:shareToken`. Mobile provides native list, form, detail, sharing, public response, revise, duplicate, and conversion flows through Hono. `POST /api/quotes/:id/send` honestly returns 503 `EMAIL_UNAVAILABLE`; clients use share-link delivery. Focused quote tests, full API/contracts/mobile suites, the web build, and iOS/Android production exports pass; authenticated native-device QA remains pending. |
| AKP-10 dashboards | **Implemented locally (2026-10-23).** Shared DTOs and `0014_configurable-dashboards.sql` add per-user/org layouts and saved reports. Summary, receivable, payable, cash and tax widgets map from AKP-05 server-authoritative reports; recent activity remains explicitly operational. Web has URL-backed filters plus CSV/PDF/print; Expo consumes the same DTO, saved layout and saved filters. Expense-category dimensions, authenticated native-device QA and deployment remain pending. |
| Mobile invoice themes | **Implemented locally (2026-10-21).** Preview and PDF HTML use the business profile theme via `resolveInvoiceTheme`, falling back to the mobile default palette including background `#F5F6F3`. |
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
| Mobile invoice theme | **Implemented locally (2026-10-21).** Business Settings → Appearance offers the six web invoice presets plus hex fields for primary, secondary, accent, text, light text, background, and surface. Live preview updates with the draft. Invalid hex is rejected. Save calls `updateBusinessProfile({ theme })` with contract colours only (`name` is not sent). Strict TypeScript, all 36 Jest suites (138 tests), and lint with no errors pass. Rendered in Chrome via Expo web; no iOS simulator here. |
| Mobile crash reporting | **Wired (2026-10-21).** `@sentry/react-native` 7.2.0 reports native crashes and JS errors. Preview and production profiles in `mobile/eas.json` set `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_ORG=ledgercraft`. Development profiles, local runs, Jest, and CI leave the DSN unset. Replay is off, the user is an id, and API failures carry `requestId`. EAS uploads source maps only with the optional `SENTRY_AUTH_TOKEN`. Strict TypeScript, ESLint, and the iOS export pass without a token. See `mobile/SENTRY.md`. |
| Web errors | **Implemented locally.** `@sentry/react` reports browser errors when `VITE_SENTRY_DSN` is set. The SDK loads after first paint. Replay, Feedback, and tracing are off. Users are id-only, and share tokens are redacted. Source maps upload in the production release only when `SENTRY_AUTH_TOKEN` exists, then `.map` files are deleted before Pages deploy. See `docs/sentry-web.md`. |
| Mobile branding | **Implemented locally (2026-10-21).** Installed display name is `easybizinvoice`; the iOS icon is opaque and full bleed, and the splash is seamless dark artwork. Bundle ID, EAS project, Apple team, entitlements, and App Store Connect identity are unchanged. |
| Mobile home actions | **Fixed locally (2026-10-21).** Home quick actions are four equal tiles (new invoice, record payment, add expense, add customer). Pressable style callbacks go through `AppPressable` because NativeWind v4 drops them. Setup-task dismissal is stored in SecureStore. Strict TypeScript and all 35 Jest suites (132 tests) pass; lint reports no errors. Native Home screenshots were not captured here. |
| Mobile onboarding | **Implemented locally (2026-10-21).** Original value carousel, progressive account signup, resumable business setup, profile-existence gating, and explicit GST registration persisted through SQLite migration `0006`. Finish setup accepts the installed iOS theme (missing `background`, filled as `#F5F6F3`). The finish alert uses connection copy only for network failures, and plain language plus a support reference for validation and server failures. Web API errors use the same wording. Mobile TypeScript, 35 Jest suites (132 tests), API 29 suites (79 tests), contracts 18 suites (58 tests), and lint with no errors pass; authenticated device QA and a production Worker deploy of this finish-setup fix remain pending. |
| API Sentry | **Implemented.** `@sentry/cloudflare` reports unhandled Worker, Durable Object, Hono, and Better Auth errors. The public DSN is a Worker var; events send only when `SENTRY_ENVIRONMENT` is `production`. Share tokens and auth material are scrubbed. Source maps upload to org `ledgercraft`, project `ledgercraft-api`. See `deploy/cloudflare.md`. |
| GST filing | **Deployed (2026-10-03).** Hono/SQLite persists IRD + reconciliation snapshots; a dedicated action records the external myIR confirmation reference; PDF export and authenticated create/save/download/file/reload browser QA pass. Frontend `714caea84c59`, Worker `77d9125d-f89c-44fb-9ec2-1d50ad1c7603`; no migration. |
| AKP-01 | **Core complete locally (2026-10-23).** Migration `0009_purchase-lifecycle.sql` and shared contracts add vendor contact/default/active/import fields, bill attachments and immutable history, validated cancel/restore, idempotent creation, atomic exact split payments, and vendor CSV preview/apply/export plus bill export. Responsive web administration and Expo payment/cancel/history/attachment/default workflows pass contract/API/web/mobile tests, the web build, authenticated desktop/390 px browser QA, and iOS/Android production exports. Deployment and authenticated native-device QA remain pending. Recurring bills are optional AKP-04 scope. |
| AKP-03 | **Implemented locally (2026-10-23).** Identity SQLite owns multi-company selection, fixed-role memberships, and hashed seven-day invitations through migration `0011_multi-company-roles.sql`. Server permission checks protect product domains, while web and Expo expose company/team workflows. Cross-company, direct-write, privilege-escalation, invitation, and removed-membership tests pass. Custom roles, outbound email, deployment, and authenticated native-device QA remain. |
| Mobile hardening | **Verified locally (2026-10-19).** Honest load failures, dirty-bill navigation protection, accessible swipe actions and inputs, exact purchase formatting/totals/payment validation, and React Native query lifecycle are integrated with the Wise dark theme and Home / Invoices / Customers / More navigation. All 17 Jest suites (69 tests), strict TypeScript, lint with no errors, and iOS/Android production exports pass. Authenticated native device QA and the missing parity domains remain pending. |
| Mobile customers | **Implemented locally (2026-10-19).** Native create/detail/edit/delete-attempt flows, invoice history and exact outstanding summaries, contact actions, customer-prefilled invoice creation, and dirty-form protection use Hono. Strict TypeScript, 17 Jest suites (69 tests), and lint with no errors pass; authenticated device QA remains pending. |
| Mobile items | **Implemented locally (2026-10-19).** Native item list/filter, create/detail/edit/delete-attempt, active-state, category and price/tax-default workflows use Hono. Exact decimal text is preserved through item form/API requests. Strict TypeScript, 18 Jest suites (72 tests), lint with no errors, and iOS/Android production exports pass; authenticated device QA remains pending. |
| Mobile banking | **Implemented locally (updated 2026-10-23).** Native bank-account list/filter, create/detail/edit/delete-attempt, active-state, exact balance fields, transaction history, manual transactions, transfers, and CSV statement selection/preview/import use Hono. Authenticated device QA remains pending. |
| Mobile layout safety | **Verified locally (2026-10-19).** One root safe-area provider, automatic large-title list insets, shared measured native-tab clearance, a measured invoice-detail action footer, fit-to-width A4 WebView metadata, and a semantic-theme template selector are in place. Strict TypeScript, all 21 Jest suites (81 tests), lint with no errors, and iOS/Android production exports pass. Native visual QA remains pending because no local iOS simulator runtime is installed and EAS Simulator is unavailable for the account. |
| Git | `origin/mobile-app` includes W4 customers. Working tree also has web Better Auth plus Hono through W13. |
| Clients | Web and mobile email login/signup → Better Auth (`/api/auth/*`). Product CRUD including journals, account writes, reminders, receipt-scan, and chat → Hono. `@supabase/supabase-js` is not installed. |

## Pickup

1. Read `AGENTS.md`, `TARGET_ARCHITECTURE.md`, and `AKAUNTING_FEATURE_PARITY_BACKLOG.md`.
2. Verify and release the local AKP-01 lifecycle slice, or continue with AKP-02 as a separate verified slice.
3. For compatible mobile OTA releases, read `ledgercraft-eas-update`. For native builds, TestFlight, or App Store Connect work, read `ledgercraft-mobile-release`.
4. Before a pull request, follow `ledgercraft-verify` and paste the command output. Domain checks are `ledgercraft-invariants`. A different session reviews with `ledgercraft-reviewer`.
5. Commit, push, or deploy only when the user asks.

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
| `ledgercraft-tdd` | Implementing or testing a slice, and bug fixes (failing test first) |
| `ledgercraft-verify` | Before a pull request: CI-matching commands, risk label, evidence |
| `ledgercraft-invariants` | Money, GST, totals, share tokens, idempotency, SQLite migrations |
| `ledgercraft-verify-ui` | Browser clicks, phone-width screenshots, invoice PDF |
| `ledgercraft-reviewer` | Independent review. Does not push, approve, or merge |
| `ledgercraft-web-ui` | Web React/Tailwind design and visual QA |
| `ledgercraft-mobile-ui` | Expo/React Native design and device QA |
| `ledgercraft-eas-update` | Compatible mobile OTA publishing, runtime checks, device verification, rollback |
| `ledgercraft-mobile-loop` | Repeated mobile backlog selection, implementation, verification, PR, and wait cycle |
| `ledgercraft-schema-rebuild` | Historical Postgres notes. Current DDL is SQLite (`ledgercraft-invariants`) |
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

Run `ledgercraft-knowledge-sync` when status or commands changed, and write present-tense facts in `TARGET_ARCHITECTURE.md` and `AGENTS.md`. Before a pull request, run `ledgercraft-verify` and paste the output.
