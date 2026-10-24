# AGENTS.md

**Recurring scheduler (implemented locally, 2026-10-23):** SQLite migration
`0016_recurring-scheduler.sql` persists tenant-scoped invoice, bill, income,
and expense templates with daily, weekly, monthly, annual, and custom
intervals, local time/timezone, end-date and occurrence limits, pause/resume/end
state, and immutable run history. Ledger Durable Object alarms claim a unique
occurrence before generating through the existing application services, so
catch-up, retries, Worker restarts, and concurrent alarms cannot create the
same period twice. Responsive web and Expo management/status screens are
included. Invoice delivery is recorded as unavailable when no mail provider is
configured; no paid scheduler or email provider is required. Deployment and
authenticated native-device QA remain pending.

**Invoice share links (implemented locally, 2026-10-24):** `GET /api/invoices/:id/shares` lists that invoice's active, non-expired shares, newest first. `POST /api/invoices/:id/shares/revoke` sets `is_active` false on every active share for the invoice, including shares that are already expired. `POST /api/invoices/:id/share` returns the newest active share for the same template (200) instead of creating another link; `{replace:true}` deactivates those active shares and inserts the new snapshot in one transaction (201). A requested `expiresAt` does not bypass reuse. Revoked or expired `GET /api/public/invoices/:token` returns 410 `SHARE_INACTIVE` with the message `This link is no longer active`. An unknown token stays 404 `NOT_FOUND`. A successful public read increments `access_count`. Routes stay organisation-scoped and use the existing invoice read/write permissions. No migration. Web and mobile revoke/replace screens are not in this change.

**Invoice lifecycle fidelity (implemented locally, 2026-10-23):** Invoice
cancel/restore/archive and idempotent duplicate workflows now keep an immutable
history and post balanced cancellation/restoration journals. SQLite migration
`0012_invoice-lifecycle.sql` and Hono own
exact line discounts and multiple taxes, private 1 MB PDF/image attachments,
snapshot-scoped public attachment access, CSV preview/apply/export, and printable
detail. Responsive web exposes the full lifecycle; Expo exposes lifecycle,
history, line pricing, and image attachment actions. Existing templates,
sharing, PDFs, payment terms, charges, bank details, and reminders remain intact.
Production email remains unavailable.
All 39 API suites (118 tests), all 19 contract suites (65 tests), all 41 mobile
Jest suites (185 tests), strict mobile TypeScript, the web production build,
and iOS/Android production exports pass. Authenticated local Chrome proof passed
at desktop and mobile web widths; authenticated native-device QA remains pending.

Operating guide for EasyBizInvoice (`ledger-craft-app`). This file replaces `Agents.md`, `CLAUDE.md`, and `GEMINI.md`. There is no `.cursorrules` file.

Spec: `TARGET_ARCHITECTURE.md`. Deployment runbook: `deploy/cloudflare.md`. Session skill: `.cursor/skills/ledgercraft-bootstrap/SKILL.md`.

Currency/localization is implemented locally through migration
`0015_currency-localization.sql`: organisation-scoped base currency, managed
precision/symbol catalogue, explicit dated rates, locale/timezone/date/number
formats, and financial-year start. Used rates are immutable. Invoice, bill,
expense, and explicit-rate base/foreign transfer records snapshot transaction
and base values. Do not claim base-currency reports or realized/unrealized
postings until AKP-05 ledger/report rules land.

## Stack that is current

Pages project `ledger-craft-app` serves the Vite app. The Hono Worker `ledgercraft-api` (`deploy/api/worker.ts`, config `deploy/api/wrangler.jsonc`) routes to SQLite Durable Objects: one Identity object for Better Auth users, emails, and sessions, and one Ledger object per organisation. The Pages Function `functions/api/[[path]].ts` proxies `/api/*`.

Local Node API uses SQLite (`api/src/db/local.ts`). Reviewed SQL is `api/sqlite-migrations/*.sql`, checksum-tracked, applied on Durable Object startup inside `storage.transactionSync`. `pnpm db:migrate` writes that SQL to the local file only.

Web and mobile email login and signup use Better Auth (`/api/auth/*`). Product reads and writes go through Hono. `@supabase/supabase-js` is not a workspace or mobile dependency. `src/integrations/supabase/client.ts` is a local stub used by leftover call sites and Vitest.

Shared Zod DTOs live in `packages/contracts`. Web imports them as `@ledgercraft/contracts`.

`mobile/` is Expo SDK 54 and is not in `pnpm-workspace.yaml`. CI installs it with `npm ci` and `mobile/package-lock.json`. Crash reporting uses `@sentry/react-native` `~7.2.0`. See `mobile/SENTRY.md`.

Business Settings → Appearance edits the invoice palette. It offers the six web presets (blue, purple, green, red, pink, slate) and hex fields for primary, secondary, accent, text, light text, background, and surface. The live preview follows the draft. Invalid hex is rejected before save. Save calls `updateBusinessProfile({ theme })` with the contract colours only, so `name` is not sent. Onboarding still starts from the installed professional palette, including `background`. The editor was checked in Chrome through Expo web. See `mobile/src/components/business/ThemeEditor.tsx`.

Banking parity uses migration `0010_banking-parity-completion.sql` for
tenant-scoped exact-money transaction splits, invoice/bill connections, and
attachment metadata. Web transaction detail supports allocation, 1 MB SQLite
attachments, duplicate, print/PDF, and CSV export. Expo supports native CSV
statement selection, exact-text preview, duplicate skipping, and import. Do not
claim authenticated native-device QA until it has been run.

Server-authoritative accounting and reporting is implemented locally through
`api/sqlite-migrations/0013_server-authoritative-reports.sql`. Posted invoices,
payments, approved expenses, bank transactions, transfers, received bills, bill
payments, and manual adjustments share exact-decimal journal rules; drafts are
excluded and posted journals are immutable at both service and SQLite-trigger
boundaries. Hono exposes financial statements, general ledger, and account
statements with organisation isolation, date/basis/comparison and relevant
account/customer/vendor filters. Web provides responsive statements, ledger,
aging, tax and CSV workflows; Expo provides native period/basis summaries. The
base currency is deliberately restricted to NZD until AKP-06 adds exchange-rate
accounting. Category filtering is accepted by the shared query contract but is
not yet applied to reports because journal lines do not carry category links.

Configurable dashboards and saved reports are implemented locally through
`api/sqlite-migrations/0014_configurable-dashboards.sql`. Per-user layouts and
saved filters remain organisation scoped. Summary, receivable, payable, cash,
and tax widgets map from the AKP-05 server-authoritative report DTO; only the
recent-activity widget is explicitly operational. Web retains shareable URL
filters plus CSV/PDF/print, while Expo uses the same DTO and saved layouts.
Authenticated native-device QA and deployment remain pending.

Invoice preview and PDF HTML use the loaded business profile theme. `resolveInvoiceTheme` in `mobile/src/utils/invoiceTheme.ts` fills missing or invalid colours from the mobile default palette, including background `#F5F6F3`. Classic, modern, minimal, executive, corporate, and modern pro templates paint with those tokens. Text on a brand fill switches to dark ink when white would be unreadable. Money and GST totals stay on the existing calculations.

Quotes and estimates are a Hono slice on their own tables (`api/sqlite-migrations/0007_quotes.sql`). Contracts live in `packages/contracts/src/quote.ts`. Authenticated routes are under `/api/quotes`; public read and respond are `/api/public/quotes/:token` and `/api/public/quotes/:token/respond`. Quote rows do not post journals. The web app lists, creates, edits, shares, revises, duplicates, and converts quotes at `/quotes` and exposes recipient accept/decline at `/shared/quote/:shareToken`. Mobile provides native list, create/edit, detail, share, public recipient response, PDF export, revise, duplicate, and accepted-quote conversion flows through the same Hono API. `POST /api/quotes/:id/send` returns 503 `EMAIL_UNAVAILABLE`; both clients present share-link delivery instead of claiming email delivery. Focused API, web, and mobile quote tests, full API/contracts/mobile suites, web build, and iOS/Android production exports pass; authenticated native-device QA remains pending.

Akaunting core parity is a versioned contract in
`docs/akaunting-core-capabilities.json`. Report mode runs in normal CI and
reports open work without hiding it; strict mode remains red until every
required core row is available. Optional AKX modules are separate and do not
block the core gate. Baseline review instructions are in
`docs/akaunting-parity-gate.md`.

Multi-company collaboration is implemented locally through SQLite migration `0011_multi-company-roles.sql`. The Identity Durable Object owns organisations, active-company selection, memberships, and hashed seven-day invitations; product data remains in one Ledger Durable Object per organisation. Fixed roles are owner, admin, accountant, member, and read-only. Hono enforces the shared permission catalogue before protected use cases, while organisation administration has dedicated server guards. Web and Expo provide company create/rename/archive/switch, team role/removal, and honest share-link invitation workflows. Custom roles, email delivery, deployment, and authenticated native-device QA remain pending.

The AKP-01 purchase lifecycle is core-complete locally through
`api/sqlite-migrations/0009_purchase-lifecycle.sql`. Vendors include contacts,
active state, defaults, notes, and import identifiers. Bills include
organisation-scoped attachments and immutable history, validated cancel/restore,
idempotent creation, and atomic exact-decimal split payments. Web provides the
full responsive lifecycle plus canonical vendor CSV preview/apply/export and
bill export. Expo applies active vendor defaults and supports split payments,
cancel/restore, attachment capture, and history. Contract/API/web/mobile tests,
the web build, authenticated desktop and 390 px browser QA, and iOS/Android
production exports pass. Deployment and authenticated native-device QA remain
pending.

Web UI follows `DESIGN.md` and `.cursor/skills/ledgercraft-web-ui/SKILL.md`. Mobile UI follows `.cursor/skills/ledgercraft-mobile-ui/SKILL.md` (Wise lime/forest, native iOS chrome). `.cursor/rules/project-guide.mdc` still contains older Supabase and Revolut examples; the files named above supersede those examples.

## Layout

```text
src/                         Vite web app
mobile/                      Expo app (npm, own lockfile)
api/                         Hono API, Drizzle schema, Vitest
api/sqlite-migrations/       reviewed SQLite migrations
packages/contracts/          Zod DTOs
functions/api/[[path]].ts    Pages /api proxy
deploy/api/wrangler.jsonc    Worker + Durable Objects
deploy/cloudflare.md         release runbook
docs/sentry-web.md           web Sentry setup
docs/PIPELINE.md             label names and risk rules
mobile/SENTRY.md             Expo crash reporting
.github/labels.yml           repository labels synced on main
.github/CODEOWNERS           review owners for migrations, money, auth, workflows, release
```

Leave `src/` and `mobile/` where they are until a change is only about moving them. Do not combine a TanStack Router migration, an `apps/` move, a UI redesign, and a data cutover.

## Software factory

`docs/PIPELINE.md` is the label and risk contract, and the only high-risk path list. `.github/labels.yml` lists `type:*`, `area:*`, `priority:p0`–`priority:p3`, `size:*`, `risk:low|medium|high`, and the state labels `spec-ready`, `agent:building`, `agent:review`, `review-passed`, `needs-human`, and `auto-merge-eligible`. `.github/workflows/labels.yml` creates and updates those labels on a push to `main` that changes the label file or the workflow, and on `workflow_dispatch`. The sync does not delete labels that are absent from the file. `.github/CODEOWNERS` requests `@jeevan-vj` on a subset of the high-risk paths. An auto-merge gate is not implemented. `auto-merge-eligible` requires every stage-6 condition in `docs/PIPELINE.md`, not `review-passed` plus `risk:low` alone. The author does not apply `review-passed` or `auto-merge-eligible`.

Before opening a pull request, follow `.cursor/skills/ledgercraft-verify/SKILL.md` and paste the command output. Draft pull request #63 proposes a lint-baseline file and warning ceilings. Until that merges, the web ceilings stay the numbers in `.github/workflows/ci.yml` (468 ESLint errors, 728 TypeScript errors). Pull request #15's experimental verification workflow is not on `main` and is not a required check.

## Commands

Package manager for the workspace is pnpm `11.19.0`. Lockfile: `pnpm-lock.yaml`.

```bash
pnpm install --frozen-lockfile
DATABASE_URL=/absolute/path/ledgercraft.sqlite pnpm db:migrate
DATABASE_URL=/absolute/path/ledgercraft.sqlite pnpm dev:api   # 127.0.0.1:3001
pnpm dev                                                      # Vite :8080, proxies /api
pnpm test:run
pnpm test:api
pnpm test:contracts
pnpm type-check
pnpm type-check:api
pnpm lint
pnpm build
pnpm verify:w1            # contracts tests, API tests, API + contracts typecheck
pnpm test:akaunting-core  # capability-manifest validator tests
pnpm verify:akaunting-core:report # validate/report without failing on open scope
pnpm verify:akaunting-core # strict; fails while any required core row is open
pnpm run deploy:check     # Node 24+. Local checks and Wrangler dry run
pnpm run deploy:cloudflare
pnpm run deploy:help
pnpm db:generate --name describe_the_change
```

`pnpm type-check` is not the web CI gate. That job runs `tsc` for `tsconfig.app.json` and `tsconfig.node.json`, then `.github/scripts/ci-baseline-gate.mjs`. The commands and ceilings are in `.cursor/skills/ledgercraft-verify/SKILL.md`.

`pnpm dev:stack` and `pnpm start` run `scripts/dev.sh`, which starts Docker Postgres on port 55432 and then the API and Vite. `.env.example` still documents those Postgres URLs. The Node API opens SQLite.

Mobile, from `mobile/`:

```bash
npm ci
npm start
npm test
npm run lint
npm run type-check
npx expo export --platform ios
```

`EXPO_PUBLIC_API_URL` defaults to `http://127.0.0.1:3001`.

Worker local dev, from the runbook:

```bash
pnpm exec wrangler dev --config deploy/api/wrangler.jsonc
```

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. Web jobs use Node 22 and `pnpm install --frozen-lockfile`, then lint, `tsc` for `tsconfig.app.json` and `tsconfig.node.json`, `pnpm test:run`, and `pnpm build`. Web lint and web typecheck still compare counts with baselines in that workflow; the count gate fails when the count rises. Mobile uses Node 20 and `npm ci`. `npm run lint`, `npx tsc --noEmit`, and `npm test -- --ci --watchAll=false` fail the job directly. The mobile count gate is gone. The iOS export is `npx expo export --platform ios` with `SENTRY_DISABLE_AUTO_UPLOAD=true`. The API & contracts job uses Node 24 and runs `pnpm test:api`, `pnpm test:contracts`, and `pnpm type-check:api`. The release-readiness job runs `node --test .github/scripts/verify-api-readiness.test.mjs scripts/upload-api-sourcemaps.test.mjs` and `node --test scripts/upload-web-sourcemaps.test.mjs`.

`.github/workflows/release.yml` deploys to Cloudflare after the `CI` workflow succeeds on a push to `main`. It checks out that run's head SHA, uses Node 24, and preserves the existing Worker `BETTER_AUTH_SECRET`. Manual `workflow_dispatch` from `main` still runs verify before deploy. The CI workflow does not receive production secrets. The release-readiness job tests the API/source-map/parity checkers and runs Akaunting parity in report mode; strict parity enforcement remains an explicit release command while the tracked core backlog is open.

## Monitoring

Web: `docs/sentry-web.md`. Browser events require `VITE_SENTRY_DSN` at build time. Source maps upload from the release workflow when `SENTRY_AUTH_TOKEN` is set, then `dist/**/*.map` is deleted before Pages deploy.

API: `deploy/cloudflare.md` section "Error monitoring (Sentry)". `@sentry/cloudflare` sends Worker events only when `SENTRY_ENVIRONMENT` is `production`. The public DSN is the `SENTRY_DSN` var in `deploy/api/wrangler.jsonc`. Project slug `ledgercraft-api`, org `ledgercraft`.

Mobile: `mobile/SENTRY.md`. `@sentry/react-native` reports native crashes and JavaScript errors. Preview and production profiles in `mobile/eas.json` set `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_ORG=ledgercraft` (project `ledgercraft-mobile`). Development profiles, local Expo, Jest, and CI leave the DSN unset. EAS uploads source maps only when the optional `SENTRY_AUTH_TOKEN` secret is present.

## Data rules

- Client → Hono → use case → repository → Drizzle → SQLite.
- DTOs come from `packages/contracts`. Clients do not import Drizzle types.
- `user_id` and `organisation_id` come from the session or membership, not the request body.
- Money stays exact decimal text. GST, invoice, and quote totals stay on `computeInvoiceTotals`. Rounding stays on `roundMoney`. See `.cursor/skills/ledgercraft-invariants/SKILL.md`.
- New SQLite SQL is generated, reviewed, and appended under `api/sqlite-migrations/`. Applied files stay byte-for-byte. `pnpm db:generate` then `pnpm deploy:cloudflare` is the production path. There is no D1 migrate step.
- Reports must derive from posted `journal_entries` and `journal_entry_lines`; do not reintroduce client-calculated production report totals.
- `supabase/` remains in the tree. `TARGET_ARCHITECTURE.md`, `AI_CONVERSATION_IMPLEMENTATION.md`, and `.cursor/skills/ledgercraft-schema-rebuild/SKILL.md` still name `supabase/migrations/`. Those files are historical hints. Do not replay them, and do not replay `migrations/*.sql`, onto the current database.
- Do not add `supabase.from`, the Storage SDK, Edge Functions, client `VITE_OPENAI_*`, or a second session system beside Better Auth.
- `api/.data/` is the local object-store default (`OBJECT_STORE_DIR` or `api/.data/objects`). It is gitignored.

## Skills

| Skill | When |
| --- | --- |
| `.cursor/skills/ledgercraft-bootstrap/SKILL.md` | Session start |
| `.cursor/skills/ledgercraft-architecture/SKILL.md` | API, database, auth, storage, email, AI |
| `.cursor/skills/ledgercraft-tdd/SKILL.md` | Failing test before production code, including bug fixes |
| `.cursor/skills/ledgercraft-verify/SKILL.md` | Before a pull request: the CI commands, risk label, and evidence |
| `.cursor/skills/ledgercraft-invariants/SKILL.md` | Money, GST, totals, share tokens, idempotency, migrations |
| `.cursor/skills/ledgercraft-verify-ui/SKILL.md` | Browser, phone-width screenshots, and invoice PDF |
| `.cursor/skills/ledgercraft-reviewer/SKILL.md` | Independent review. Does not push, approve, or merge |
| `.cursor/skills/ledgercraft-web-ui/SKILL.md` | Web UI |
| `.cursor/skills/ledgercraft-mobile-ui/SKILL.md` | Expo UI |
| `.cursor/skills/ledgercraft-mobile-release/SKILL.md` | EAS, TestFlight, App Store Connect |
| `.cursor/skills/ledgercraft-mobile-loop/SKILL.md` | Repeated mobile backlog cycle |
| `.cursor/skills/ledgercraft-schema-rebuild/SKILL.md` | Schema reconstruction |
| `.cursor/skills/ledgercraft-vertical-slice/SKILL.md` | One domain onto Hono |
| `.cursor/skills/ledgercraft-agent-roster/SKILL.md` | Splitting work across specialist agents |
| `.cursor/skills/ledgercraft-knowledge-sync/SKILL.md` | After a wave, when docs drift |

Parent chat is the orchestrator. Launch specialists from the roster skill. After a wave, update present-tense facts in `TARGET_ARCHITECTURE.md` and this file.

Feature parity that is still open is tracked in `AKAUNTING_FEATURE_PARITY_BACKLOG.md`. Release evidence for the published Cloudflare app is the dated sections of `deploy/cloudflare.md`.
