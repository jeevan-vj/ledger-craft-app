# LedgerCraft target architecture

**Mobile home actions (fixed locally, 2026-10-21):** Expo Home uses four
equal quick-action tiles: new invoice, record payment, add expense, and add
customer. Record payment opens the invoice list, where marking an invoice paid
already captures the payment. Style callbacks on `Pressable` go through
`AppPressable`, because NativeWind v4's JSX runtime replaces those callbacks
with an empty style. Dismissing the setup task is stored in SecureStore.
Strict mobile TypeScript and all 28 Jest suites (102 tests) pass, and mobile
lint reports no errors. Native Home screenshots were not captured: this
environment has no iOS simulator, and Home requires a signed-in session.

**Mobile branding (implemented locally, 2026-10-21):** Expo resolves the
installed display name as `easybizinvoice`. Its iOS icon is an opaque,
full-bleed 1024 px asset and its splash screen uses seamless dark brand artwork.
Release identity remains `com.easybizinvoice.app` under the existing EAS project,
Apple team, Associated Domains entitlement, and App Store Connect app.

**Mobile onboarding core (implemented locally, 2026-10-21):** Expo first launch
now includes an original LedgerCraft value carousel, progressive account
signup, and resumable business setup for name, country, and explicit GST
registration. Profile existence is the auth/onboarding gate; safe drafts use
SecureStore without persisting passwords. Hono/SQLite persists GST status via
`0006_business-gst-registration.sql`. Strict mobile TypeScript, all 21 Jest
suites (83 tests), all 29 API suites (78 tests), all 18 contract suites (57
tests), lint with no errors, and iOS/Android production exports pass.
Authenticated device QA remains open.

**Mobile invoice sharing (implemented locally, 2026-10-19):** Expo invoice
detail now separates public-link sharing, PDF download/export, and PDF file
sharing. Public links use the existing immutable Hono/SQLite snapshot and can
open an unauthenticated native invoice route through the app scheme or the
production HTTPS path; the web fallback remains available and now offers
Open/Get app actions with theme-correct recipient states. iOS Associated
Domains and the production AASA file use the Team ID verified from TestFlight
build 5. Android intent routing is configured, but EAS has no Android signing
credential yet, so a production `assetlinks.json` and Android device link
verification remain pending. Mobile strict TypeScript, all 23 Jest suites (89
tests), lint with no errors, and iOS/Android production exports pass. The
focused web shared-invoice test and Vite production build pass; authenticated
sender and signed-device deep-link QA remain open.

**Mobile layout safety (verified locally, 2026-10-19):** Expo now has one
root-owned safe-area provider, shared measured native-tab clearance for tab
scenes, automatic large-title list insets, and a measured invoice-detail action
footer. A4 invoice HTML keeps its 595 × 842 print canvas without forcing a
desktop initial scale in mobile WebViews, and the template selector follows the
Wise semantic theme. Strict TypeScript, all 21 Jest suites (81 tests), lint with
no errors, and iOS/Android production exports pass. Native visual QA remains
open because no local iOS simulator runtime is installed and EAS Simulator is
unavailable for the account.

**Mobile banking management (implemented locally, 2026-10-19):** Expo now
provides bank-account list/filter, create, detail, edit, delete-attempt,
active-state, exact opening/current balances, and per-account imported
transaction history from More through Hono. Dirty bank-account forms are
protected from dismissal. Strict TypeScript, 20 Jest suites (78 tests), lint
with no errors, and iOS/Android production exports pass. Authenticated device QA
remains open; manual transactions, transfers, splits, attachments, and mobile
import remain in AKP-02.

**Mobile item catalogue (implemented locally, 2026-10-19):** Expo now exposes
item list/filter, create, detail, edit, delete-attempt, active-state, category,
sales/purchase price, and tax-default workflows from More through Hono. Exact
decimal text is retained through item forms and API requests; conversion to a
number occurs only when populating the existing numeric invoice line editor.
Dirty item forms are protected from dismissal. Strict TypeScript, 18 Jest
suites (72 tests), lint with no errors, and iOS/Android production exports pass;
authenticated device QA remains open.

**Mobile hardening (verified locally, 2026-10-18):** Expo distinguishes failed
loads from genuine empty states, protects unsaved bill edits, exposes invoice
and expense actions without requiring swipe gestures, preserves exact purchase
decimals through display, draft totals, and payment validation, and reconnects
React Query to native app focus and network state. The unavailable Google login
action was removed and accessibility/token usage were tightened. Strict
TypeScript, Jest, and iOS/Android production exports pass. Authenticated native
device QA and the missing parity domains remain open.

**Mobile customer management (implemented locally, 2026-10-19):** Expo now
provides customer create/detail/edit/delete-attempt flows, customer invoice
history and exact outstanding summaries, contact actions, and customer-prefilled
invoice creation through Hono. Customer invoice lookup no longer relies on the
retired Supabase stub when the Hono invoice API is enabled. Dirty customer forms
are protected from dismissal. Strict TypeScript, 17 Jest suites (69 tests), and
lint with no errors pass; authenticated native device QA remains open.

**Mobile Wise dark redesign (branch only, 2026-10-16):** The Expo client on
`codex/mobile-wise-ui` uses a system-aware dark-first lime theme and Home /
Invoices / Customers / More native tabs. Shared pill, card, list-row, setup-card
and circular-icon primitives now drive the redesigned Home, customer, invoice
chrome, and profile/settings surfaces. Expenses and Purchases remain available
under More. The native tab bar is preserved and styled within its supported API;
this branch is not deployed and visual device QA remains pending.

**GST return workflow (deployed, 2026-10-03):** The GST wizard now
stores its calculated IRD and reconciliation snapshot in the existing
`tax_returns.return_data` column. Filing is a dedicated, atomic draft-to-
submitted transition that requires the confirmation reference obtained after
filing in myIR; LedgerCraft does not claim to transmit returns to IRD. The web
client exports a PDF preparation/filing record and uses date-only quarter
boundaries. Contract/API/UI tests, the local release gate, and an authenticated
create/save/download/file/reload browser flow pass. Frontend build
`714caea84c59` and Worker `77d9125d-f89c-44fb-9ec2-1d50ad1c7603` are published,
and the production smoke suite passes. No schema migration was needed;
readiness remains `0004_purchases-payables.sql`.

**Mobile purchases/payables (TestFlight submitted, 2026-10-04):** Expo now has
a native Purchases tab for vendor and bill browsing, bill draft create/edit and
detail, receive/void actions, and exact-decimal partial/full payment capture
against bank accounts. Focused API-client tests and iOS/Android Expo production
exports pass. EAS production iOS archive build 2
(`170b1d99-61c0-4616-8ccd-e3a111c10f21`) finished successfully and submission
`1b89f039-ccbc-4af5-8e7f-81874f082f54` was uploaded to App Store Connect for
TestFlight. Apple processing and authenticated device QA remain pending;
attachments, history, cancel/restore, split allocations, import/export, and
recurring bills remain open in AKP-01.

**Purchases/payables slice (deployed, 2026-10-03):** Vendor CRUD and
draft/receive/void/pay bill workflows now run through shared Zod contracts,
Hono use cases, Drizzle repositories, and organisation-scoped SQLite tables.
Receiving a bill posts expense/GST input against accounts payable; payments
post accounts payable against bank and update exact partial/paid balances
atomically. Web vendor and bill workflows follow the existing Revolut-inspired
system and adapt to mobile web. Migration `0004_purchases-payables.sql` is
reviewed, checksum tracked and applied in production. Frontend build
`2fb57d9d033e` and Worker `383a4429-5305-412d-b95b-70ac37cb2bd6` are published.
Release gates, live smoke checks, and authenticated Browser purchase flows pass.
Attachments, history, cancel/restore, split allocations, import/export,
recurring bills, and final native device QA remain in AKP-01.

**Expense flow repair (deployed, 2026-10-03):** Web expense create/edit/reload now
persists the existing IRD GST treatment, exemption reason, claimable percentage
and private-use percentage fields through Hono/SQLite. New expenses default to
NZD, and amount/tax inputs have valid label associations. Migration
`0003_expense_gst_treatment.sql` preserves existing rows with standard/none/
100/0 defaults. Production frontend build `1a996cac23f2` and Worker
`6b5c99a4-7df6-4a91-8cfb-493b88708c97` are published. Contract, API/SQLite,
component, live smoke, and authenticated browser create/edit/reload checks pass.
Production readiness reports `0003_expense_gst_treatment.sql`.

**Invoice sharing (deployed, 2026-09-15):** Invoices → Share generates a token
link with copy/open actions. Logged-out recipients can view the invoice and
download its PDF with the selected template, actual tax rate and separate bank
details. Links contain an invoice/profile snapshot; create a new link after
changing the invoice. Production build `934e59362a4f`, Worker
`26e32c83-ab9f-4eb7-a264-65ecb0d61595` are published. Release smoke tests and
Chrome sender/recipient, reload, PDF, mobile and invalid/expired-link checks
pass. No new migration is needed. See `deploy/cloudflare.md`.

**Invoice bank details (deployed, 2026-09-14):** Settings → Preferences stores
separate account name and account number fields through Hono/SQLite migration
`0002_business_bank_details.sql`. All six web invoice templates and PDFs show
separate labelled payment rows; empty values are hidden. Production build
`c6c95ec1a8fe`, Worker `71f96f39-7989-4f34-a9a3-a093034b19df` are published.
Release smoke checks and Chrome settings save/reload, invoice reload and PDF
verification pass. See `deploy/cloudflare.md`.

**Additional-charge release (2026-09-14):** named invoice charges persist through
the API/web mapper. Build `1b3eef9860bf` and Worker
`1b20615b-343e-4a6f-99e9-38fa157005d3` are published; local checks and live
read-only checks pass. Customer invoice updates and live mutation verification
remain pending access/approval. See `deploy/cloudflare.md`.

**Status (2026-10-03):** the user approved the Cloudflare-only free SQLite
architecture below. It supersedes this document's older PostgreSQL, S3, Resend
and container decisions. The earlier reconstruction phases remain historical
context; their API/DTO boundaries, exact-money rules, transaction guarantees and
tenant-isolation gates still apply. The SQLite API is deployed and live API
checks passed; the frontend is published at https://easybiz.iamjeevan.com
and live website plus Chrome login/navigation checks passed (build `6849a8db7473`).

Schema changes use `pnpm db:generate --name change`, followed by SQL review and
`pnpm deploy:cloudflare`. Production migrations apply on each object’s next
startup before requests are served; inactive organisations are not eagerly woken.

## Current free Cloudflare architecture

Pages `ledger-craft-app` serves React/Vite. Hono runs in Worker `ledgercraft-api`.
A single Identity SQLite Durable Object owns Better Auth users, unique emails
and sessions. The authenticated gateway routes organisation data to a separate
Ledger SQLite Durable Object per organisation. SQLite-backed Durable Objects
provide interactive accounting transactions and the CPU budget needed for
secure password hashing. D1 is not used.

The request path is **client → Hono → use case → repository → Drizzle → SQLite**.
The gateway derives tenant ownership from authenticated membership. Organisation
predicates and composite tenant foreign keys support the per-object isolation
boundary. Monetary storage uses decimal TEXT and authoritative calculations use
exact server decimal helpers, never floating-point ledger arithmetic.
Attachments are stored in SQLite with a 1 MB limit. Client-side PDF generation
and downloads remain available. External email delivery and AI are unavailable
in this free deployment and must return an honest unavailable result.

There are no paid Containers, R2, PostgreSQL, Supabase or third-party hosted
services in this target. Free Cloudflare quotas bound availability; the release
workflow does not subscribe to paid services. Reviewed application migrations
live in `api/sqlite-migrations/*.sql`; bundled checksums detect changes to applied
SQL. Durable Objects record pre-migration recovery bookmarks in
`_migration_recovery`, then apply pending migrations in `storage.transactionSync`
on startup before serving requests. This approved SQLite lifecycle supersedes the older prohibition
on application-startup migrations in the PostgreSQL design below.

Run `pnpm deploy:check` for local release validation and `pnpm deploy:cloudflare`
for repeatable deployment and live smoke checks. Use Node 24+ (tested with Node
26) and pinned pnpm. The signing secret in ignored `deploy/secrets.local.json`
is reused; retain a secure backup. If it is missing locally, deployment inspects
remote secret names and preserves an existing remote signing secret. A new key
is generated only for an initial absent secret; failed remote inspection stops
deployment. Never rotate signing keys implicitly during routine deployment. See `deploy/cloudflare.md` for local SQLite development,
Wrangler commands, migration behavior and verification evidence.

## Historical reconstruction context

**Reconstruction (2026-09-03):** the hosted project still exists (`viqckjmborlqaemavrzu`) but `public` has zero tables, `auth.users` is empty, storage is empty, and no app migrations are applied. Production rows and identities are unrecoverable unless a platform backup is found. Reconstruction is greenfield toward this document, not a forensic clone. Do not replay checked-in SQL in order. Derive compatibility columns from application TypeScript contracts (`src/types`, service mappers). Skip preserving old `auth.users` UUIDs.

**W1–W13 verified (2026-09-11).** Web and mobile email login/signup are Better Auth. Live auth routes no longer call Supabase Auth. Tax/IRD/GST period screens read Hono invoice/expense/tax rows when flags are on. Hono slices: customers, business profile, items, invoices (send + remind), expenses, payments, accounts list/write/initialize, journals, bank, recon persist, tax config/returns, objects, receipts, receipt-scan, conversations, `POST /api/ai/chat`. `@supabase/supabase-js` is removed from web and mobile; hosted project URL/anon key and Edge Function URLs are gone. Vitest still sets domain flags `false` so leftover `supabase.from` call sites hit a local stub, not a hosted project. **Next:** TanStack Router / `apps/` only after you are ready to delete the remaining stubbed client SQL. Pickup: `AGENTS.md` § Reconstruction agents. Cloudflare: see the current free SQLite architecture above and `deploy/cloudflare.md`.

Operating plan: specialist agents, two lanes (compatibility boot vs Hono target), TDD, and a knowledge loop. Session start: `.cursor/skills/ledgercraft-bootstrap/SKILL.md`. Other skills in `.cursor/skills/`. Roster and protocol in `AGENTS.md`.

The `mobile-app` source uses Hono and Better Auth with the SQLite deployment
implementation described above. The earlier Pages upload from `main` is a
separate legacy frontend release and does not deploy or verify this backend.
The backend is deployed at
`https://ledgercraft-api.jeevan90wijerathna.workers.dev`, Worker version
`bcbef6d7-8c90-404a-9103-d38d1eca4f55`. Live checks passed signup, sessions,
tenant isolation, invoice totals, concurrent creation, rollback, idempotency,
attachments, public sharing, sign-out/sign-in and persistence. The new Pages
frontend publication and website verification remain pending.

Web UI stays Revolut-inspired. Mobile UI is Wise-inspired (lime `#9FE870`, forest `#163300`, sparse whitespace) on native iOS 26 chrome (Liquid Glass tab bar, large titles). Do not copy the Wise wordmark or flag. The web router and repository layout may change after the API boundary is established; the product is not being rewritten in Next.js or TanStack Start.

---

## Decision

LedgerCraft will become a modular monolith with separate web, mobile, and API applications:

```text
Browser                                      Expo
React + Vite                                 React Native
TanStack Router                              React Navigation
TanStack Query                               TanStack Query
      │ same-origin cookie                          │ secure mobile session
      └────────────────── HTTPS ────────────────────┘
                              │
                              ▼
                         Hono API
                  Better Auth · Zod · modules
                  use cases · Drizzle · jobs
                    │          │          │
                    ▼          ▼          ▼
               PostgreSQL    S3 API     Resend / AI
```

The required request path is:

> **Client → API route → application use case → repository → Drizzle → PostgreSQL**

Never:

```text
Browser or Expo → PostgreSQL
Browser or Expo → Drizzle
React component → Supabase/PostgREST
Route handler → unrelated SQL and business logic
Client → OpenAI or another secret-bearing provider
```

### Standard stack

| Concern | End-state choice | Explicitly not |
| --- | --- | --- |
| Web | React, Vite, TypeScript, TanStack Router | Next.js, TanStack Start |
| Mobile | Expo, React Native, React Navigation | Web wrapper as the primary app |
| Server state | TanStack Query v5 on web and mobile | API data duplicated into Zustand or context |
| Forms | React Hook Form + Zod | A second form framework |
| API | Hono on Node.js | Browser PostgREST, GraphQL, Workers-first |
| API contract | Shared Zod DTOs + Hono RPC typing | Drizzle row types exposed to clients |
| Identity | Better Auth with PostgreSQL-owned identity tables | Supabase Auth in the final state, Clerk |
| Authorization | API checks + PostgreSQL RLS backstop | UI-only role checks |
| Data access | Drizzle repositories | SQL in screens, pages, hooks, or route handlers |
| Database | PostgreSQL through `DATABASE_URL` | D1 or SQLite as the system of record |
| Files | Provider-neutral object keys through an S3 adapter | Supabase Storage URLs as persistent identifiers |
| Email | Resend behind the API | Client-triggered provider calls |
| AI | Server-side provider adapter behind authenticated API routes | Public Vite/Expo provider keys |
| Workspace | pnpm workspaces | Separate npm dependency graphs long-term |
| Tests | Vitest, Testing Library, Playwright, real test PostgreSQL | Repository tests that only mock Drizzle |

Turborepo is not required initially. Add it only when the workspace task graph produces a measurable benefit.

### Architectural rules

1. Clients receive DTOs, never database models or credentials.
2. Every network input is runtime-validated.
3. Application use cases own business rules and transaction boundaries.
4. Repositories own Drizzle queries and no business workflows.
5. TanStack Query owns remote state. Zustand and React state own client-only state.
6. PostgreSQL constraints and RLS remain a backstop even though the API authorizes requests.
7. External side effects are idempotent and retried through a durable database-backed job/outbox when required.
8. Production migrations are reviewed SQL artifacts applied by CI/CD, never implicit application startup work.

---

## Why this shape

### Small scale

LedgerCraft is a dual-client invoicing product, not a platform company. Microservices, event buses, CQRS, and per-tenant SQLite databases add ops without adding customers.

One API process, one Postgres, one auth library in-repo is enough for:

- Invoice CRUD, numbering, line items, journals
- Expenses, payments, bank import, reconciliation
- GST / IRD reports
- Logo and receipt uploads
- Email send (already Resend)

### Supportable

Today the lock-in is not SQL. It is:

- `auth.users` and `auth.uid()` in migrations
- `supabase-js` in web *and* mobile services (different selects, duplicated logic)
- Storage URLs and bucket API
- GoTrue sessions in `StableAuthContext` and Expo SecureStore
- A hardcoded Supabase Edge Function URL in `emailService.ts`

God files (`src/services/supabaseService.ts`, `reconciliationService.ts`) and a unused mock `src/services/api.ts` make the same feature exist three ways.

A single Hono module per domain is something one person can debug, log, and deploy.

### AI-agent friendly

Agents fail on this repo because:

- Files are too large to fit in context
- Web and mobile each implement SQL
- `ServiceContainer`, mock API, and live Supabase are three conventions
- Screens sometimes import the Supabase client directly

The target is **vertical slices**: one folder, one Zod contract, one route, one service, one repo, one Query hook, tests beside the module. File budget ~400 lines. No second implementation on mobile.

### No vendor-locked auth/data API

Supabase Postgres is portable (`pg_dump`). Supabase Auth, RLS dialect (`auth.uid()`), Storage, and PostgREST are not.

Better Auth is MIT, stores users in *our* tables, has an Expo plugin, and lives in the API process. Drizzle emits SQL we can read. Hono runs on Node, Bun, or Workers — we host the *process* on Fly/Railway first so we do not trade GoTrue for Hyperdrive + 10 ms CPU.

Cloudflare remains optional (Pages/CDN, R2 as *one* S3 implementation). It is not the database.

---

## Runtime and trust boundaries

```
┌─────────────────────────────────────────┐
│  Clients (untrusted)                    │
│  Vite PWA          Expo                 │
│  Router + Query     Navigation + Query  │
│         cookie / secure mobile session  │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│  Hono API (only privileged process)     │
│  Better Auth · Zod · use cases · jobs   │
│  Drizzle repositories                   │
└──────┬──────────────┬───────────┬───────┘
       ▼              ▼           ▼
   PostgreSQL      S3 API      Resend
   + RLS           (files)     (email)
```

| Trust zone | What lives there |
| --- | --- |
| Browser / device | UI, Query cache, Better Auth client, local drafts; no database or provider secrets |
| API | Authentication, authorization, validation, business rules, transactions, uploads, email, AI |
| PostgreSQL | Source of truth, constraints, idempotency records, RLS backstop |
| Object store | Object bytes only; private receipts and controlled access to logos |
| Email / AI providers | Called by the API only |

**Public exceptions:** `/api/auth/*`, health/readiness endpoints, and token-scoped `GET /api/share/:token`. Every other route requires a session.

For the web application, production should expose the API on the same site:

```text
https://app.example.com/*       → Vite assets
https://app.example.com/api/*   → Hono API
```

This keeps browser cookies first-party and removes most CORS configuration. Local Vite development proxies `/api` to the API process. Expo uses the public HTTPS API URL directly.

---

## Identity, tenancy, and authorization

Better Auth owns `users`, `sessions`, `accounts`, and `verifications` in PostgreSQL. Configure Better Auth model names explicitly; avoid a quoted singular `user` table. The product already has `accounts` (chart of accounts). Better Auth's provider-account table **must** use a different name (e.g. `auth_accounts`).

**Reconstruction:** hosted `auth.users` is empty — skip UUID preservation. Better Auth is staged in the API (`/api/auth/*`, `/api/me`). Do not cut clients off Supabase Auth until every protected path uses Hono. Pickup: `AGENTS.md` § Reconstruction agents.

LedgerCraft data is owned by a business/organisation, not directly by one login:

```text
users
  └── organisation_memberships
        └── organisations
              ├── business_profiles
              ├── customers
              ├── invoices
              ├── expenses
              └── accounting data
```

The application owns organisation and membership tables. Better Auth owns identity and sessions. Existing users receive one organisation during migration, and their current data is assigned to it. This supports future collaboration without another ownership-model rewrite.

App tables use `organisation_id` for tenant isolation and may use `created_by_user_id` or `updated_by_user_id` for audit history. They reference `users.id`, not `auth.users(id)`.

Authorization has two layers:

1. **API (primary):** verify the session, resolve active membership, check the action, and bind trusted user and organisation IDs. Never accept ownership IDs from a request body.
2. **RLS (backstop):** use transaction-local PostgreSQL settings rather than `auth.uid()`:

```sql
USING (
  organisation_id =
  NULLIF(current_setting('app.organisation_id', true), '')::uuid
)
```

Each tenant-scoped repository operation runs inside the use case transaction:

```sql
SELECT set_config('app.user_id', $session_user_id, true);
SELECT set_config('app.organisation_id', $active_organisation_id, true);
```

The API must not connect as a superuser, a `BYPASSRLS` role, or a table owner.

Use separate roles:

```text
ledgercraft_migrator  owns schema objects; used only by migration jobs
ledgercraft_app       owns no tables; receives explicit DML/sequence grants
ledgercraft_readonly  optional operational read access
```

Apply `FORCE ROW LEVEL SECURITY` where owner access could occur accidentally. Integration tests must prove that `ledgercraft_app` cannot read or write another organisation's rows even when repository filters are missing.

### Browser sessions

Use Better Auth's HttpOnly cookie sessions with:

- `Secure` in production
- `SameSite=Lax` where the same-origin deployment permits it
- origin and CSRF checks enabled
- explicit trusted origins
- no access or refresh tokens in `localStorage`

### Expo sessions

Use the Better Auth Expo client/server integration with SecureStore, the application deep-link scheme, explicit trusted origins, and OAuth callbacks configured for development and production. Do not treat browser cookie configuration as sufficient for Expo.

### Identity migration

Preserving existing Supabase user UUIDs is mandatory. Import Better Auth user and provider-account records using the current IDs before switching foreign keys. Import Google provider identifiers so a returning user does not receive a second account.

Do not assume GoTrue password hashes are either compatible or incompatible. Test Better Auth verification against a production-shaped copy:

- If supported and reviewed, migrate credential account hashes and rehash after successful login.
- If unsupported, require a password reset with user communication and tested recovery.

There is one active identity provider at a time. The migration may stage Better Auth tables while Supabase Auth remains authoritative, but clients must not have two competing session systems. The cutover happens only after every protected data path uses Hono.

The current frontend `PermissionGuard` remains presentation only. The API repeats every permission check against the active organisation membership.

---

## Client architecture

### Web

The end-state web application uses TanStack Router with file-based routes, generated route types, lazy route loading, and Zod-validated search parameters. Filters, sorting, pagination, and selected tabs belong in the URL when they should survive refresh or be shareable.

Do not migrate React Router before the API and Query boundaries are stable. Router migration is a late, mechanical web-only phase; it must not delay removal of client SQL.

Feature layout:

```text
apps/web/src/
  routes/
  features/
    invoices/
      api/
      components/
      hooks/
      schemas.ts
    customers/
    expenses/
  components/ui/
  lib/
    api-client.ts
    auth-client.ts
    query-client.ts
```

### Mobile

Expo keeps React Navigation. TanStack Router is not a React Native migration target.

TanStack Query owns API data. Zustand keeps only client state such as in-progress invoice editing, unsaved wizard state, UI preferences, and other values that are not authoritative on the server.

Configure TanStack Query's React Native focus and online managers using AppState and network connectivity so refetch and paused-mutation behaviour is deliberate.

### Query conventions

`@tanstack/react-query` is installed in both clients, but current production data still flows through `useAppData`, `DataManagerSOLID`, `ServiceContainer`, contexts, Zustand slices, and SQL-bearing services.

Migration replaces that orchestration stack domain by domain:

- Query keys are factories: `invoiceKeys.list(filters)`, `invoiceKeys.detail(id)`.
- Query functions call the HTTP client only.
- Mutations invalidate or update the smallest correct keys.
- Auth session state stays in the Better Auth client.
- API responses are not copied into Zustand, AppContext, or another cache.
- Offline mutation support is enabled only for use cases with idempotency and conflict rules.

**Not in scope:** TanStack Start, TanStack Form, TanStack DB, or replacing React Hook Form.

---

## Target repository

The final repository is a pnpm workspace:

```text
ledger-craft-app/
  apps/
    web/                      React + Vite + TanStack Router
    mobile/                   Expo + React Navigation
    api/                      Hono modular monolith
  packages/
    contracts/                Zod request/response DTOs only
  pnpm-workspace.yaml
  package.json
```

Start the migration without moving directories:

```text
src/                          current web app
mobile/                       current Expo app
api/                          new Hono app
packages/contracts/           new shared contracts
```

Move `src/` to `apps/web` and `mobile/` to `apps/mobile` only after both clients use the API. Directory churn must not be mixed with domain cutovers.

Do not create `packages/ui` initially. Web and React Native do not share rendering primitives. Add packages only when a real reuse boundary exists.

### API layout

```text
apps/api/src/
  auth/
    auth.ts
  db/
    client.ts
    roles.ts
    schema/
      auth.ts
      organisations.ts
      invoices.ts
      accounting.ts
  middleware/
    auth.ts
    errors.ts
    request-context.ts
    logging.ts
  modules/
    invoices/
      invoice.routes.ts
      invoice.service.ts
      invoice.repository.ts
      invoice.test.ts
    customers/
    expenses/
    payments/
    reconciliation/
  jobs/
  lib/
  index.ts
drizzle/
```

Use vertical slices. Do not create global `controllers/`, `services/`, and `repositories/` folders that scatter one feature across the repository.

### Layer responsibilities

**Route**

- authenticate and resolve request context
- parse and validate transport input
- call one application use case
- map the result to the standard response/error model

**Application service/use case**

- enforce permission and business rules
- own the transaction boundary
- orchestrate repositories and durable side effects

**Repository**

- issue Drizzle queries
- map database rows to domain values
- assume the transaction context is already established

Repositories do not open hidden transactions. Routes do not contain business calculations or unrelated SQL.

### Contracts

`packages/contracts` contains public Zod request and response schemas. Clients infer DTO types from these schemas. It must not export:

- Drizzle tables or `$inferSelect` types
- internal audit or provider fields
- database connection code
- server-only environment configuration

Hono RPC typing may provide compile-time request/response inference inside the workspace. Zod remains the runtime contract. Both API and client TypeScript configurations use strict mode. If external consumers are added, publish an OpenAPI contract from the same route schemas rather than maintaining a second handwritten specification.

### Standard API errors

Every error response uses:

```json
{
  "error": {
    "code": "INVOICE_NOT_FOUND",
    "message": "Invoice could not be found",
    "requestId": "req_..."
  }
}
```

Global error middleware maps validation, authentication, authorization, not-found, conflict, and unexpected failures consistently. Provider and database errors are not returned verbatim.

After cutover, delete:

- `@supabase/supabase-js`
- `src/integrations/supabase/`
- Mobile services that embed SQL
- Mock `src/services/api.ts` as a data source
- Supabase Edge Function email URL
- Client-side OpenAI calls and public provider keys
- `DataManagerSOLID`, superseded context caches, and obsolete auth contexts

`ServiceContainer` is transitional. Remove it after screens import feature hooks and HTTP services no longer require global location.

---

## Example use case: create invoice

1. UI calls `useCreateInvoice().mutate(payload)`
2. Query sends `POST /api/invoices` with an idempotency key and the appropriate session
3. Hono validates the request DTO with Zod
4. Auth middleware resolves user, active organisation, and `invoice:create` permission
5. The use case starts a transaction and sets the RLS request context
6. The server validates line items and recomputes subtotal, GST, charges, and total
7. The sequence row is locked or atomically updated with `UPDATE ... RETURNING`
8. The use case inserts the invoice, lines, and balanced journal entries
9. The idempotency record stores the successful response
10. The API returns a camelCase response DTO
11. Query invalidates invoice and dashboard keys

Required database constraints include:

```sql
UNIQUE (organisation_id, invoice_number)
CHECK (quantity > 0)
CHECK (rate >= 0)
CHECK (subtotal >= 0)
CHECK (total >= 0)
```

Invoice create is one transaction. A journal failure fails the transaction; it is not logged and ignored.

### Money

PostgreSQL uses `NUMERIC`, never floating-point types, for money and GST. The API contract uses one explicit representation:

- integer minor units for currencies with fixed minor units, or
- canonical decimal strings processed by a server-side decimal library

Do not deserialize authoritative money into JavaScript `number` and perform ledger calculations. Client calculations are previews only; the server returns persisted totals.

Rounding rules are named and tested for tax-inclusive prices, tax-exclusive prices, line-level versus invoice-level rounding, discounts, additional charges, and currency precision.

---

## What we considered and rejected

| Option | Why not |
| --- | --- |
| Keep Supabase Auth + RLS + `supabase-js` in clients | Fast, but the lock-in we are removing |
| Supabase Auth + Hono BFF (JWT forwarded, RLS kept) | Good *bridge*, not the end state if Auth/Storage must go |
| Cloudflare D1 | SQLite, no `DECIMAL`, no portable RLS, Workers-only, write serialization; wrong for money and GST |
| Hyperdrive + service role | API becomes the only authz layer *and* bypasses RLS; easy to leak tenants |
| Better Auth bolted onto live `auth.uid()` | Better Auth is not a Supabase third-party IdP; JWT bridging is a footgun |
| Microservices | ~15 domains, one team |
| Next.js / TanStack Start | Does not help Expo; months of UI churn |
| GraphQL | One web + one mobile, both TypeScript; REST + Zod is enough |
| Prisma | Weaker Workers story if we ever run at the edge; Drizzle stays portable |
| Client talking to Postgres | Untrusted UI + leaked credentials |

**Valid bridge (not the target):** Hono + Drizzle against the *current* Supabase instance using the **Postgres connection string only** (dumb hosted Postgres). Dump to Neon/RDS/Fly when clients no longer import `supabase-js`.

---

## Database schema and migrations

The checked-in Supabase migrations are not a complete reconstruction of the current database. Core tables exist in generated types but are absent from the migration history, and SQL is split across `supabase/migrations/`, `migrations/`, and root scripts.

Before Drizzle becomes authoritative:

1. Export the live schema with `pg_dump --schema-only`.
2. Inventory tables, columns, constraints, indexes, sequences, functions, triggers, extensions, grants, storage references, and every RLS policy.
3. Reconcile the export against generated TypeScript types and application usage.
4. Resolve known sharing-schema drift before generating a baseline.
5. Create a reviewed Drizzle schema and custom SQL baseline.
6. Restore the baseline into an empty PostgreSQL database and run integration tests.

End-state workflow:

```text
Drizzle schema change
       ↓
drizzle-kit generate
       ↓
reviewed SQL migration in Git
       ↓
CI restore + migration tests
       ↓
controlled production migration job
```

Do not use `drizzle-kit push` against production. Do not edit a migration after it has been applied. Destructive and backfill-heavy changes use expand/migrate/contract deployments so old and new application versions can overlap safely.

## External services

### Object storage

Database rows store provider-neutral object keys and metadata, not full Supabase or S3 URLs. The storage adapter issues short-lived upload/download URLs or streams small objects when appropriate.

- Receipts are private.
- Logos use an explicit public or signed policy.
- Upload authorization scopes the organisation and key prefix.
- Content type, file size, and image processing limits are enforced server-side.
- Existing `business-assets` objects are copied and verified before URL fields are rewritten.
- Shared invoices define whether assets are snapshotted or served through token-scoped access.

### Email

The API calls Resend. Invoice sends use an idempotency key. If a send must survive process failure, the invoice transaction records an outbox job and a worker in the same modular monolith performs the external call. Provider message IDs and safe failure metadata are stored for support.

### AI and receipt extraction

OpenAI or another AI provider is called only by the API. Remove `VITE_OPENAI_API_KEY`, `EXPO_PUBLIC_OPENAI_API_KEY`, `dangerouslyAllowBrowser`, and direct mobile provider calls.

AI routes require:

- authentication and organisation authorization
- request and file-size limits
- rate and spend limits
- redaction-aware structured logs
- explicit retention rules
- typed, validated outputs before accounting data is persisted

AI output is untrusted input. It may propose receipt fields or invoice actions; normal domain validation and permissions still apply.

## Observability and operations

Every request receives a request ID. Structured logs include route, status, duration, deployment version, and safe user/organisation identifiers. Never log passwords, session cookies, authorization headers, provider keys, raw receipt contents, or full financial records.

Minimum operational signals:

- HTTP request count, latency, and error rate
- database pool saturation and query latency
- authentication successes and failures
- job/outbox age and retry count
- email and AI provider failures
- migration version and readiness status

Add OpenTelemetry when cross-service tracing is useful; it is not required to create the first API route.

Expose:

```text
GET /healthz   process health only
GET /readyz    database and required dependency readiness
```

Backups, restore tests, migration rollback/roll-forward procedures, and secret rotation are release requirements.

## Testing

Use:

- unit tests for pure domain calculations and permission rules
- component tests for web and mobile behaviour
- API integration tests against real PostgreSQL with all migrations applied
- RLS tests using the actual `ledgercraft_app` role
- contract tests for Zod DTOs and Hono responses
- Playwright for critical browser flows
- mobile integration tests for authentication, deep links, offline recovery, and mutation idempotency

Do not mock Drizzle in the tests intended to validate SQL, constraints, transactions, or RLS.

Critical scenarios:

1. Cross-organisation reads and writes fail.
2. Retried invoice creation returns the original result.
3. Invoice, lines, sequence, and journal commit or roll back together.
4. Server totals cannot be overridden by client totals.
5. Shared tokens enforce active/expiry state without exposing other rows.
6. Old and new schemas overlap during expand/contract migrations.
7. Web and supported mobile versions work during each feature-flag phase.
8. Source and target row counts, totals, object counts, and sampled hashes reconcile.

## CI/CD

Pull requests run:

```text
pnpm install --frozen-lockfile
  → lint
  → typecheck
  → unit/component tests
  → empty-database migration test
  → API integration and RLS tests
  → web/API/mobile build checks
  → Playwright critical flows
```

Production deploys:

```text
build immutable API artifact
  → backup / pre-migration checks
  → run controlled migrations
  → deploy API
  → deploy web
  → publish mobile separately
  → smoke and reconciliation checks
```

Migrations do not run implicitly when an API instance starts.

## Hosting

The deployment is provider-portable:

| Concern | Target constraint |
| --- | --- |
| API | Node.js Hono process or container using standard HTTP |
| PostgreSQL | Standard connection string plus a compatible pooler |
| Files | S3-compatible adapter |
| Web | Static Vite deployment with same-origin `/api/*` routing |
| Mobile | EAS release calling the public HTTPS API |

The first production host is Cloudflare: **Pages** for the Vite SPA, a **Node container** for Hono (`Dockerfile`, `API_HOST=0.0.0.0`), and Postgres (Neon or equivalent) via `DATABASE_URL`. Same-origin `/api/*` is a Pages Function proxy (`functions/api/[[path]].ts`) so Better Auth cookies stay on the site origin. Object storage is a filesystem adapter locally; R2 is the S3 adapter when `S3_BUCKET` is wired. Operational runbook: `deploy/cloudflare.md`.

D1 is not the database. Workers + Hyperdrive are a later option only if transaction-mode pooling is proven against `set_config('app.organisation_id', …, true)`. They are not the initial runtime.

## Migration plan

The final state has one identity provider, but the data plane must move before the identity cutover. A global `VITE_API_URL` flag is insufficient: web flags are build-time, Expo values are release-time, and domains move independently.

Use per-domain routing/capability flags with telemetry and an explicit rollback path.

### Phase 0: inventory and security baseline

- Capture the complete live database and storage schema.
- Inventory every domain: customers, items, invoices, expenses, payments, receipts, accounts, journals, tax/GST/IRD, bank import, reconciliation, sharing, AI conversations, receipt AI, email, and reminders.
- Remove or rotate exposed AI credentials and stop shipping provider keys in clients.
- Add request IDs, structured errors, and baseline flow tests.
- Define supported mobile versions and forced-upgrade behaviour.

### Phase 1: workspace, contracts, and API shell

- Adopt pnpm workspaces without moving the current clients.
- Add `api/`, `packages/contracts/`, health/readiness endpoints, error middleware, logging, and test PostgreSQL.
- Create separate database roles and prove RLS request context.
- Proxy `/api` through Vite locally and through the production edge/gateway.

Supabase Auth remains the only active identity provider in this phase. Hono validates the existing Supabase JWT as a temporary bridge and binds the same user UUID. This bridge is migration code, not the target auth architecture.

### Phase 2: first vertical slices

Migrate customers first, then items and categories:

- shared request/response schemas
- Hono route, use case, repository, and integration tests
- web and mobile Query hooks
- per-domain feature flag and rollback
- source/target response comparison where practical

Remove the corresponding data from `DataManagerSOLID`, contexts, Zustand server state, and SQL-bearing mobile services after the new path is stable.

### Phase 3: accounting core

Migrate invoices, invoice sharing, payments, receipts, expenses, accounts, and journals.

Invoice migration is the primary architecture gate. Do not proceed until numbering, totals, lines, journals, idempotency, permissions, and RLS pass real PostgreSQL integration tests.

### Phase 4: reporting and complex domains

Migrate transaction import, reconciliation, tax/GST/IRD reporting, conversations, AI actions, and reminders. Split current god services by use case while moving them; do not reproduce a 1,000-line service behind Hono.

### Phase 5: storage, email, and AI

- Copy object storage with checksums/object counts.
- Switch database fields from provider URLs to object keys.
- Move email to Hono + Resend with idempotency/outbox behaviour.
- Move all AI calls behind API routes.
- Disable Supabase Storage and Edge Function writes after verification.

### Phase 6: client consolidation

- Ship a mobile release that uses Hono for every protected data path.
- Enforce the minimum supported version before retiring Supabase endpoints.
- Remove web `useAppData`/DataManager/ServiceContainer server-state paths.
- Remove mobile Zustand server-state slices.
- Migrate web routing to TanStack Router.
- Move clients to `apps/web` and `apps/mobile`.

### Phase 7: Better Auth cutover

- Import users and provider accounts with existing UUIDs.
- Repoint application foreign keys from `auth.users` to Better Auth `users`.
- Rehearse password migration/reset and Google account linking.
- Configure web cookies, Expo SecureStore/deep links, trusted origins, and recovery flows.
- Cut clients from Supabase sessions to Better Auth in a controlled release.
- Keep a tested rollback window; do not allow both session systems to authorize application data concurrently.

### Phase 8: PostgreSQL host cutover and retirement

Using Supabase as temporary hosted PostgreSQL is acceptable after clients stop using PostgREST, Auth, Storage, and Edge Functions.

For the final database move:

1. Rehearse backup/restore and measure the cutover.
2. Use a write freeze or replication strategy with a final delta.
3. Restore and verify migrations, constraints, roles, RLS, sequences, row counts, accounting totals, and sampled records.
4. Switch the API connection and run smoke/reconciliation checks.
5. Preserve the source project and backups through the rollback and old-mobile compatibility window.
6. Delete Supabase only after adoption, reconciliation, and rollback exit criteria pass.

## Rules for implementation and review

1. New domain work includes contracts, route, use case, repository, Query hook, and tests.
2. Do not add new `supabase.from`, Storage SDK, Edge Function, or direct AI-provider calls in clients.
3. Keep module files near 400 lines; split by use case before extending god files.
4. Zod DTOs are the transport source of truth. Drizzle types stay inside the API.
5. Ownership IDs are derived from the session and active membership, never trusted from request bodies.
6. Use cases own transactions. Repositories accept a transaction/database interface.
7. Server state belongs in Query, not Zustand, AppContext, or duplicate singleton caches.
8. Persist money as exact values and calculate authoritative totals on the server.
9. Every retriable mutation has an idempotency and conflict strategy.
10. UI permission guards never replace API authorization.
11. Production schema changes include reviewed SQL migrations and integration tests.
12. Do not combine UI redesign, router migration, directory moves, and data-plane cutover in one change.

## Current versus target

| Current | Target |
| --- | --- |
| Web/mobile → `supabase-js` → PostgREST | Web/mobile → Query → Hono |
| Supabase Auth session in each client | Better Auth, first-party web cookie, Expo integration |
| Data owned directly by `user_id` | Organisation-owned data with memberships |
| RLS through `auth.uid()` | API authorization + transaction-local organisation RLS |
| SQL spread across web/mobile services | Drizzle repositories in one API |
| DataManager/context/Zustand duplicate server state | TanStack Query owns server state |
| Client-side invoice numbering and partial writes | Atomic server use case with idempotency |
| Supabase public object URLs in rows | Provider-neutral object keys |
| Edge Function email | Hono + Resend + durable outbox when needed |
| Client-side OpenAI calls | Authenticated, rate-limited server AI routes |
| Fragmented/incomplete SQL history | Reviewed Drizzle schema and restorable migration baseline |
| React Router | TanStack Router on web; React Navigation remains on mobile |
| Separate npm lockfiles | pnpm workspace |

## Trade-offs

- The API adds deployment and operational responsibility that PostgREST currently provides.
- Organisation tenancy and Better Auth increase migration scope but avoid preserving a user-owned data model that conflicts with planned collaboration.
- RLS plus API authorization duplicates some checks; the duplication is deliberate defence in depth.
- Hono RPC gives strong internal typing but couples client builds to API types. Shared DTOs remain the stable boundary, and OpenAPI is added if external consumers appear.
- TanStack Router improves typed web navigation but does not help Expo, so it is deferred until the data migration is complete.
- Exact decimal handling is more verbose than JavaScript numbers and is required for accounting correctness.
- A staged migration temporarily carries old and new paths. Feature flags, telemetry, reconciliation, and deletion criteria prevent that state from becoming permanent.

## Success criteria

- Both clients use one deployable Hono API for every protected data operation.
- No database, Supabase, Storage, Resend, or AI provider SDK is imported by web/mobile application code.
- Better Auth preserves existing user identities and is the only active identity provider.
- Every business row is organisation-scoped and cross-tenant RLS tests pass with the runtime role.
- Invoice creation atomically commits number, lines, totals, journal, and idempotency result.
- TanStack Query is the only server-state cache in web and mobile.
- The database can be recreated from Git in an empty PostgreSQL instance.
- A `pg_dump`/restore to another PostgreSQL host requires no application SQL rewrite.
- Storage can move between S3-compatible providers without rewriting persisted database URLs.
- AI and email credentials never appear in browser bundles or mobile releases.
- Supported old and new clients are tested during each migration phase.
- A new list/detail feature is implemented in one vertical slice rather than by extending a god service.

## References

- [TanStack Router: Vite installation](https://tanstack.com/router/latest/docs/framework/react/routing/installation-with-vite)
- [TanStack Router: search parameters](https://tanstack.com/router/latest/docs/framework/react/guide/search-params)
- [TanStack Query v5: overview](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Query v5: React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)
- [Hono: validation](https://hono.dev/docs/guides/validation)
- [Hono: RPC](https://hono.dev/docs/guides/rpc)
- [Drizzle ORM: migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle ORM: transactions](https://orm.drizzle.team/docs/transactions)
- [Better Auth: Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)
- [Better Auth: Expo integration](https://www.better-auth.com/docs/integrations/expo)
- [Better Auth: session management](https://www.better-auth.com/docs/concepts/session-management)
- [OWASP: Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
