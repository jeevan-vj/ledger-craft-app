# Agents.md - LLM Guide for LedgerCraft Project

**Mobile invoice themes (implemented locally, 2026-10-21):** Invoice preview
and PDF HTML read the loaded business profile `theme`. Missing or invalid
tokens fall back through `resolveInvoiceTheme` to the mobile default palette,
including background `#F5F6F3`. Classic, modern, minimal, executive, corporate,
and modern pro templates paint with those tokens, and text on a brand fill
switches to dark ink when white would be unreadable. Money and GST totals are
unchanged.

**Mobile invoice theme editor (implemented locally, 2026-10-21):** Business Settings → Appearance edits the invoice palette. It offers the same six web presets and hex fields for primary, secondary, accent, text, light text, background, and surface, with a live preview. Save persists `updateBusinessProfile({ theme })` using contract colours only. Strict TypeScript, all 36 Jest suites (138 tests), and lint with no errors pass.

**Mobile crash reporting (wired, 2026-10-21):** Expo reports native crashes and JavaScript errors through `@sentry/react-native` 7.2.0. Preview and production profiles in `mobile/eas.json` set `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_ORG=ledgercraft`. Development profiles, local runs, Jest, and CI leave the DSN unset. The client keeps Session Replay off, sends the user id only, and tags server failures with the API `requestId`. Source maps upload on EAS builds only when the optional `SENTRY_AUTH_TOKEN` secret is present. See `mobile/SENTRY.md`.

**Mobile home actions (fixed locally, 2026-10-21):** The Expo Home screen uses
four equal quick-action tiles: new invoice, record payment, add expense, and
add customer. Record payment opens the invoice list, which already captures a
payment when an invoice is marked paid. `AppPressable` opts style callbacks out
of NativeWind's Pressable wrapper, which otherwise drops them. Dismissing the
setup task persists in SecureStore. Native Home screenshots were not captured
here.

**Mobile branding (implemented locally, 2026-10-21):** The installed Expo app
uses the display name `easybizinvoice`, an opaque full-bleed iOS icon, and a
seamless dark splash screen. The existing iOS bundle ID, EAS project, Apple
team, Associated Domains capability, and App Store Connect app remain unchanged.

**Mobile onboarding core (implemented locally, 2026-10-21):** First launch now
uses an original LedgerCraft value carousel, progressive account signup, and a
resumable business setup for name, country, and explicit GST registration.
Passwords are never persisted in drafts. Profile existence is the onboarding
gate, and GST status is stored through Hono/SQLite migration
`0006_business-gst-registration.sql`. Finish setup accepts the installed iOS
theme, which omitted `background`, by filling `#F5F6F3`. New builds send
`background`. Connection copy is only for requests that never reach the API.
Validation and server failures use plain language plus a support reference when
the response includes a request id. Web API errors use the same wording. A
rejected upsert does not leave a business profile. Strict mobile TypeScript,
all 35 Jest suites (132 tests), lint with no errors (90 existing warnings),
all 29 API suites (79 tests), and all 18 contract suites (58 tests) pass.
Authenticated device QA and a production Worker deploy of this finish-setup
fix remain pending.

**Mobile invoice sharing (implemented locally, 2026-10-19):** Expo invoice
detail now exposes separate share-link, download/export PDF, and share-PDF
workflows backed by the existing tokenized Hono snapshot. Shared HTTPS/app
links route to an unauthenticated native invoice view when supported and retain
the public web fallback with Open/Get app actions. iOS Associated Domains and
the AASA file are configured with the build-5 Team ID. Android intent routing
is configured; production `assetlinks.json` and signed-device verification are
blocked on the first Android signing credential. Strict TypeScript, all 23
mobile Jest suites (89 tests), lint with no errors, iOS/Android production
exports, the focused web test, and a Vite production build pass. Authenticated
sender and signed-device deep-link QA remain pending.

**Mobile layout safety (verified locally, 2026-10-19):** The Expo root now owns
safe-area metrics, tab-hosted screens reserve the measured native tab-bar
height, large-title lists use automatic content insets, and invoice detail
actions measure their footer instead of relying on magic spacers. Mobile A4
invoice previews retain print dimensions while fitting narrow WebViews, and the
template selector uses the Wise semantic theme. Strict TypeScript, all 21 Jest
suites (81 tests), lint with no errors, and iOS/Android production exports pass.
Native visual QA remains pending because no local iOS simulator runtime is
installed and EAS Simulator is unavailable for the account.

**Mobile banking management (implemented locally, 2026-10-19):** The Expo More
tab now provides bank-account list/filter, create, detail, edit, delete-attempt,
active-state, exact opening/current balances, and per-account imported
transaction history through the Hono bank API. Dirty forms are protected from
dismissal. Strict TypeScript, all 20 mobile Jest suites (78 tests), lint with no
errors, and iOS/Android production exports pass; authenticated device QA remains
pending. Manual transactions, transfers, splits, attachments, and mobile import
remain in AKP-02.

**Mobile item catalogue (implemented locally, 2026-10-19):** The Expo More tab
now provides item list/filter, create, detail, edit, delete-attempt, active-state,
category selection, sales/purchase pricing, and tax-default workflows through
the Hono item API. Item form/API boundaries preserve exact decimal text, while
the legacy numeric invoice line editor converts only when an item is selected.
Dirty forms are protected from dismissal. Strict TypeScript, all 18 mobile Jest
suites (72 tests), lint with no errors, and iOS/Android production exports pass;
authenticated device QA remains pending.

**Mobile hardening (verified locally, 2026-10-18):** The Expo client reports
dashboard and expense loading failures honestly, protects dirty bill forms from
accidental dismissal, exposes invoice/expense row actions to assistive
technology, preserves exact purchase amounts through formatting, draft totals,
and payment validation, and follows React Native connectivity/app-focus query
lifecycle. The unavailable Google sign-in action is not advertised and core
inputs/date controls follow the current Wise system. Strict TypeScript, Jest,
and iOS/Android production exports pass; authenticated native device QA remains
pending. Missing parity domains remain in `AKAUNTING_FEATURE_PARITY_BACKLOG.md`.

**Mobile customer management (implemented locally, 2026-10-19):** The Expo
Customers tab now supports direct create, detail, edit and delete attempts,
customer-level invoice history and exact outstanding summaries, contact actions,
and customer-prefilled invoice creation through the Hono APIs. Dirty forms are
protected from dismissal. Strict TypeScript, all 17 mobile Jest suites (69
tests), and lint with no errors pass; authenticated device QA remains pending.

**API error monitoring:** The Hono Worker reports unhandled errors through
`@sentry/cloudflare` (worker fetch, Identity, Ledger, Hono `onError`, and
`/api/auth/*`). The public DSN is `vars.SENTRY_DSN`. Events are sent only when
`SENTRY_ENVIRONMENT` is `production`, which the release deploy sets. Node, tests,
and local Wrangler stay quiet.
Release uploads source maps only when the `SENTRY_AUTH_TOKEN` GitHub secret
exists. Setup and the debug route are in `deploy/cloudflare.md`.

**Pull request CI:** `.github/workflows/ci.yml` runs on every pull request and on
push to main. Web jobs use pnpm from `package.json` `packageManager` (no
`pnpm/action-setup` `version` input), Node 22, and `pnpm install --frozen-lockfile`.
They lint, typecheck `tsconfig.app.json` and `tsconfig.node.json`, run
`pnpm test:run`, and `pnpm build`. The mobile job uses Node 20, `npm ci` in
`mobile/`, then ESLint (`eslint-config-expo` flat config), `tsc --noEmit`, Jest,
and `npx expo export --platform ios`. Web lint and web typecheck are not clean.
Each still runs and prints its diagnostics. A count gate fails those jobs only
when the count rises past the baseline recorded in the workflow. Mobile lint,
`tsc --noEmit`, and Jest are hard checks: measured 2026-10-21 they report 0
ESLint errors, 0 TypeScript errors, and 0 Jest failures, and the mobile job
fails when any of those commands exits non-zero. ESLint warnings do not fail
the job. The API & contracts job uses the same pnpm
install and cache on Node 24, and runs `pnpm test:api`, `pnpm test:contracts`,
and `pnpm type-check:api`. The workflow does not start Postgres and does not
deploy.

**Mobile Wise dark redesign (branch only, 2026-10-16):** The Expo client on
`codex/mobile-wise-ui` now has a system-aware dark-first lime theme, reusable
pill/card/list/setup/icon primitives, and Home / Invoices / Customers / More
native tabs. Home, invoice chrome, customer browsing, and profile/settings use
the new visual language; Expenses and Purchases remain reachable from More.
The native tab implementation is intentionally retained, so its bar is styled
dark with lime selection rather than replaced by a custom floating tab bar.
This work is not deployed and has not had simulator/device visual QA.

**Item catalogue parity (implemented, 2026-10-18):** Core item and category
management now supports strict exact-decimal validation, hydrated categories,
active/inactive lifecycle, duplication, atomic bulk actions, and canonical CSV
preview/apply/export through Hono/SQLite migration
`0005_item-catalogue-parity.sql`. Web item management includes status filtering,
bulk controls, category lifecycle controls, profile-currency display, and
responsive layouts. Invoice pickers expose only active sale-enabled items and
apply item sale price and tax defaults; mobile adapters follow the same DTO and
picker eligibility. Media and multi-tax catalogue extensions remain backlog.

**GST return workflow (deployed, 2026-10-03):** Web GST returns now
persist the calculated IRD/reconciliation snapshot through Hono/SQLite, use a
dedicated draft-to-filed action with the myIR confirmation reference, and export
a real PDF preparation/filing record. The UI no longer claims to submit directly
to IRD. Quarter boundaries use date-only NZ calendar values. Contract/API/UI
tests, the local release gate, and an authenticated create/save/download/file/
reload browser flow pass. Frontend build `714caea84c59` and Worker
`77d9125d-f89c-44fb-9ec2-1d50ad1c7603` are published; the production smoke
suite passes. No migration was required; readiness remains
`0004_purchases-payables.sql`. See `deploy/cloudflare.md`.

**Mobile purchases/payables (TestFlight submitted, 2026-10-04):** The Expo app
now includes a native Purchases tab with vendor and bill browsing, draft bill
create/edit, bill detail, receive/void actions, and exact-decimal partial/full
payments against organisation bank accounts. Focused mobile API tests and iOS/
Android Expo production exports pass. EAS production iOS archive build 2
(`170b1d99-61c0-4616-8ccd-e3a111c10f21`) finished successfully and submission
`1b89f039-ccbc-4af5-8e7f-81874f082f54` was uploaded to App Store Connect for
TestFlight; Apple processing and authenticated device QA remain pending.
Attachments, history, cancel/restore, split allocations, import/export, and
recurring bills remain open in AKP-01.

**Purchases/payables slice (deployed, 2026-10-03):** Vendor CRUD and
bill draft/receive/void/payment workflows are implemented through Hono/SQLite
with exact totals, balanced accounts-payable journals, overpayment rejection,
and organisation isolation. Web Vendors, Bills, and Bill form screens follow
the current Revolut-inspired UI and responsive layout. Migration
`0004_purchases-payables.sql` is applied in production. Frontend build
`2fb57d9d033e` and Worker `383a4429-5305-412d-b95b-70ac37cb2bd6` are published;
release gates, live smoke checks, and authenticated Browser purchase flows pass.
AKP-01 still requires attachments, history, cancel/restore, split allocations,
import/export, recurring bills, and final native device/authenticated QA.

**Expense flow repair (deployed, 2026-10-03):** Web expense create/edit/reload now
persists IRD GST treatment, exemption reason, claimable percentage and private-use
percentage through Hono/SQLite. New expenses default to NZD, and amount/tax input
labels correctly target their fields. Migration `0003_expense_gst_treatment.sql`
preserves existing rows with standard/none/100/0 defaults. Production frontend
build `1a996cac23f2` and Worker `6b5c99a4-7df6-4a91-8cfb-493b88708c97` are
published. Local release gates, live smoke checks, and authenticated browser
create/edit/reload verification pass. Readiness reports
`0003_expense_gst_treatment.sql`. See `deploy/cloudflare.md`.

**Design-system release (deployed, 2026-10-02):** The web app now follows the
LedgerCraft Revolut-inspired system and the Expo client follows the Wise-inspired
native system, with reusable agent skills documenting both. Production frontend
build `ad2aaea114f0` and Worker
`d8bff048-7d26-48e1-8384-18b6d3031ac8` are published. Local release gates and
live authenticated smoke checks pass. No SQL migration was added; readiness
remains `0002_business_bank_details.sql`. See `deploy/cloudflare.md`.

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

This document provides comprehensive guidance for AI agents (LLMs) working on the LedgerCraft codebase. Use this as a reference for understanding project structure, conventions, and development patterns.

## Read this first

**Start:** `.cursor/skills/ledgercraft-bootstrap/SKILL.md` then `TARGET_ARCHITECTURE.md`.

**Current deployment decision (2026-09-14):** the user approved Cloudflare-only
free infrastructure with SQLite. This section and `deploy/cloudflare.md`
supersede older PostgreSQL, RLS, Supabase, S3/R2, Containers and external-provider
instructions below and in reconstruction skills. Those storage/deployment
sections describe historical reconstruction stages; do not follow them for the
current release. Preserve the API/DTO, authentication, exact-money, transaction
and tenant-isolation requirements while using the SQLite implementation.

Pages (`ledger-craft-app`) serves the web client. The Hono Worker
(`ledgercraft-api`) uses an Identity SQLite Durable Object for Better Auth users,
unique emails and sessions, and one Ledger SQLite Durable Object per organisation.
Use no D1, paid Containers, R2, PostgreSQL, Supabase or external email/AI service.
Uploads are SQLite attachments capped at 1 MB. Monetary values remain exact
TEXT decimals. Reviewed `api/sqlite-migrations/*.sql` are checksum-tracked and
applied transactionally on object startup before serving requests. The SQLite backend is deployed (Worker
`ab83b548-acf0-4c8b-a05b-d8dcdd33dd92`) and live API checks passed authentication,
tenant isolation, invoice transactions/concurrency/idempotency, attachments,
sharing and persistence. The frontend is published and verified at
https://easybiz.iamjeevan.com (build `6849a8db7473`); Chrome login, invoice
navigation and authenticated refresh passed. Migration recovery bookmarks are saved in `_migration_recovery` before
schema execution inside `storage.transactionSync`. Generate new SQLite SQL with `pnpm db:generate --name change`;
review it, then use `pnpm deploy:cloudflare` to deploy code and bundled migrations.
`pnpm deploy:help` lists commands; `pnpm db:migrate` is local-only.

| | |
| --- | --- |
| Spec | `TARGET_ARCHITECTURE.md` — end state and gates. Not optional. |
| Live DB | Hosted `public` is empty (2026-09-03). Greenfield. Do not replay Git SQL. No UUID import. |
| Now | W1–W13 **verified**. Purchases/payables is deployed through migration `0004`; remaining AKP-01 work is explicitly tracked in `AKAUNTING_FEATURE_PARITY_BACKLOG.md`. |
| Release gate | Production build `2fb57d9d033e` and Worker `383a4429-5305-412d-b95b-70ac37cb2bd6` are verified; readiness reports `0004_purchases-payables.sql`. |
| Clients | Web and mobile email auth are Better Auth. Product CRUD routes through Hono. Expo has vendor/bill browsing, draft create/edit, receive/void and payment-critical flows in successful EAS iOS build 2; TestFlight submission and authenticated device QA remain pending. `@supabase/supabase-js` is not a dependency. No new client SQL, Storage SDK, Edge Functions, or `VITE_OPENAI_*`. Mobile visual language is Wise lime/forest + iOS 26 native chrome; web stays Revolut. Web error monitoring is Sentry (`@sentry/react`), loaded after first paint, and stays out of the bundle until `VITE_SENTRY_DSN` is set. See `docs/sentry-web.md`. |
| Ports | Local API **3001**, Vite **8080** (`/api` proxy); SQLite needs no database port. |
| Package manager | **pnpm** workspace (`api`, `packages/contracts`). `mobile/` is not in the workspace yet. |

**Skills (read the matching one):**

Deployment: `pnpm run deploy:check` validates SQLite/API/frontend/Worker locally;
`pnpm run deploy:cloudflare` deploys the Worker and Pages, then runs live checks.
Use Node 24+ (tested with Node 26) and pinned pnpm. The ignored
`deploy/secrets.local.json` signing secret is reused and should be backed up
securely. If the local file is absent, the script inspects remote secret names
and preserves an existing signing secret; it generates only an initial absent
secret and stops if remote inspection fails. Never rotate it implicitly. Local
`pnpm db:migrate` uses a SQLite `DATABASE_URL`; `pnpm dev:api` starts the Node API.
Wrangler local development exercises the actual production Durable Object model.
See `deploy/cloudflare.md` for commands and rollout/verification details.

| Skill | Use |
| --- | --- |
| `.cursor/skills/ledgercraft-bootstrap/SKILL.md` | Every session |
| `.cursor/skills/ledgercraft-architecture/SKILL.md` | API / DB / auth / providers |
| `.cursor/skills/ledgercraft-tdd/SKILL.md` | Tests and implementation order |
| `.cursor/skills/ledgercraft-verify/SKILL.md` | Prove a feature/wave works |
| `.cursor/skills/ledgercraft-verify-ui/SKILL.md` | Browser, screenshots, invoice PDF |
| `.cursor/skills/ledgercraft-web-ui/SKILL.md` | Revolut-inspired web UI implementation and review |
| `.cursor/skills/ledgercraft-mobile-ui/SKILL.md` | Wise-inspired native UI implementation and review |
| `.cursor/skills/ledgercraft-mobile-release/SKILL.md` | EAS iOS build, App Store Connect, TestFlight, and release handoff |
| `.cursor/skills/ledgercraft-mobile-loop/SKILL.md` | Repeated pick, implement, verify, PR, and wait loop for mobile parity |
| `.cursor/skills/ledgercraft-schema-rebuild/SKILL.md` | Schema from app types |
| `.cursor/skills/ledgercraft-vertical-slice/SKILL.md` | One domain onto Hono |
| `.cursor/skills/ledgercraft-agent-roster/SKILL.md` | Task subagent prompts |
| `.cursor/skills/ledgercraft-knowledge-sync/SKILL.md` | End of wave / doc drift |

Orchestrator (parent chat) sequences waves. Do not mix UI redesign, TanStack Router, `apps/` moves, and a data cutover.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Project Structure](#project-structure)
4. [Key Conventions & Patterns](#key-conventions--patterns)
5. [Development Workflow](#development-workflow)
6. [Common Tasks Guide](#common-tasks-guide)
7. [Important Files Reference](#important-files-reference)
8. [Database Schema](#database-schema)
9. [Design System Guidelines](#design-system-guidelines)
10. [Testing Strategy](#testing-strategy)
11. [Deployment & Build](#deployment--build)
12. [Reconstruction agents](#reconstruction-agents)

---

## Project Overview

**LedgerCraft** (formerly EasyBizInvoice) is a modern, dual-platform financial management application for businesses. The project consists of:

- **Web Application**: Progressive Web App (PWA) for desktop and mobile web browsers
- **Mobile Application**: Native iOS and Android apps built with React Native (Expo)

### Key Features

- 💰 **Expense Tracking**: Comprehensive expense management and categorization
- 🧾 **Invoice Generation**: Create, edit, and share professional invoices with templates
- 🏦 **Bank Account Management**: Multi-account support with transaction imports
- 📊 **CSV Transaction Import**: Upload and process bank statements automatically
- 💳 **Payment Management**: Track invoice payments and payment reminders
- 📱 **PWA Support**: Works offline with app installation capability
- 🔐 **Secure Authentication**: User management with Supabase Auth
- 📈 **Financial Reporting**: Generate reports for tax and business purposes
- 🎯 **Smart Categorization**: Automatic transaction categorization
- 🔄 **Real-time Sync**: Live data synchronization across devices
- 📄 **Receipt Scanning**: OCR-powered receipt scanning and extraction
- 📋 **Tax Reporting**: IRD-compliant tax reporting for New Zealand businesses

### Production URL

- Web: https://easybizinvoice.com
- Mobile: Available on iOS App Store and Google Play Store

---

## Architecture & Tech Stack

### Web Application Stack

- **Framework**: React 18.3+ with TypeScript
- **Build Tool**: Vite 5.4+
- **Styling**: Tailwind CSS 3.4+ with shadcn/ui components
- **Routing**: React Router v6
- **State Management**: React Context API
- **Data Fetching**: TanStack Query (React Query)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, RLS)
- **Testing**: Vitest (unit), React Testing Library (components), Playwright (E2E)
- **Deployment**: Vercel/Netlify

### Mobile Application Stack

- **Framework**: React Native 0.81+ (Expo SDK ~54)
- **Language**: TypeScript
- **Styling**: NativeWind 4.2+ (Tailwind for React Native)
- **Navigation**: React Navigation v7
- **State Management**: Zustand 5.0+
- **Backend**: Supabase (shared with web)
- **Testing**: Jest with React Native Testing Library
- **Crash reporting**: `@sentry/react-native` 7.2.0. Preview and production EAS profiles set the DSN. Local runs, Jest, CI, and development profiles leave it unset. See `mobile/SENTRY.md`.
- **Build & Deployment**: EAS Build (Expo Application Services)

### Backend & Infrastructure

**Current clients still assume:** PostgreSQL via Supabase, Supabase Auth, Storage, PostgREST, `auth.uid()` RLS. That hosted app schema is empty.

**Target (see `TARGET_ARCHITECTURE.md`):** Hono API, Better Auth, Drizzle, organisation RLS, S3 adapter, Resend/AI behind the API only.
- **Real-time**: Supabase Realtime subscriptions
- **API**: Supabase REST API and PostgREST

### Design System

- **Web**: Revolut-inspired (blue `#5B72EE`, cards, slate text)
- **Mobile**: Wise-inspired lime/forest (`#9FE870` / `#163300`) on iOS grouped canvas. Native tabs/stack, large titles, Liquid Glass tab bar (no opaque `tabBarStyle` tint). Lime CTAs use forest text, never white. No emoji chrome.
- **Typography**: System San Francisco on mobile; clear hierarchy with bold headings
- **Animations**: Smooth transitions (200-300ms), micro-interactions

---

## Project Structure

### Root Directory

```
ledger-craft-app/
├── src/                      # Web (Vite). Do not move to apps/web until W9
├── mobile/                   # Expo. Not in pnpm workspace yet
├── api/                      # Hono + Drizzle (W1+)
├── packages/contracts/       # Zod DTOs only
├── docker/postgres/init/     # DB roles for Compose
├── supabase/                 # Legacy SQL — do not replay in order
├── tests/                    # Playwright
├── pnpm-workspace.yaml
├── TARGET_ARCHITECTURE.md    # End-state spec
├── .cursor/skills/           # Agent procedures
├── .cursor/rules/            # Always-on gates
└── AGENTS.md                 # This file
```

### Web Application (`/src`)

```
src/
├── main.tsx               # Entry point (React DOM render)
├── App.tsx                # Root component with providers
├── routes.tsx             # React Router configuration
├── components/            # React components
│   ├── ui/               # shadcn/ui base components
│   ├── invoice/          # Invoice-related components
│   ├── expense/          # Expense management components
│   ├── payment/          # Payment tracking components
│   ├── auth/             # Authentication components
│   ├── dashboard/        # Dashboard widgets
│   ├── layout/           # Layout components (headers, sidebars)
│   └── common/           # Shared utility components
├── pages/                # Page components (route handlers)
├── services/             # Service layer (Supabase abstractions)
├── hooks/                # Custom React hooks
├── context/              # React Context providers
├── types/                # TypeScript type definitions
├── utils/                # Utility functions
├── lib/                  # Library configurations
│   ├── providers/       # Context providers
│   └── store/           # State management utilities
└── integrations/         # Third-party integrations
    └── supabase/        # Supabase client and types
```

### Mobile Application (`/mobile/src`)

```
mobile/src/
├── App.tsx               # Entry point (Expo)
├── navigation/           # React Navigation setup
│   ├── AppNavigator.tsx # Main app navigation
│   ├── AuthNavigator.tsx # Auth flow navigation
│   └── types.ts         # Navigation type definitions
├── screens/             # Screen components
│   ├── auth/            # Login, signup, onboarding
│   ├── invoices/       # Invoice list, detail, create
│   ├── main/           # Dashboard
│   └── settings/       # Settings screens
├── components/          # Reusable components
│   ├── ui/            # Base UI components
│   ├── invoice/       # Invoice-specific components
│   ├── dashboard/     # Dashboard widgets
│   └── onboarding/    # Onboarding flow components
├── services/           # Service layer (Supabase)
├── store/              # Zustand state management
├── hooks/              # Custom React hooks
└── types/              # TypeScript type definitions
```

### Database (`/supabase`)

```
supabase/
├── migrations/          # SQL migration files
├── config.toml         # Supabase configuration
└── types.ts            # Generated TypeScript types
```

---

## Key Conventions & Patterns

### Database Naming Conventions

**CRITICAL**: Supabase uses `snake_case` for all database columns and tables. TypeScript code uses `camelCase`.

**Database (Supabase)**:
- Table names: `business_profiles`, `invoice_items`, `payment_accounts`
- Column names: `user_id`, `created_at`, `sale_price`, `invoice_number`

**TypeScript**:
- Interface properties: `userId`, `createdAt`, `salePrice`, `invoiceNumber`
- Transform snake_case → camelCase in service layer

**Example Service Pattern**:

```typescript
// services/invoiceService.ts
const { data, error } = await supabase
  .from('invoices')
  .select('id, user_id, invoice_number, created_at')  // snake_case
  .eq('user_id', userId)  // snake_case in query
  .single();

// Transform to camelCase for TypeScript
const invoice: Invoice = {
  id: data.id,
  userId: data.user_id,           // Transform
  invoiceNumber: data.invoice_number,  // Transform
  createdAt: data.created_at,     // Transform
};
```

### Component Patterns

**Web Components**:
- Functional components with TypeScript interfaces
- Use hooks (`useState`, `useEffect`, custom hooks)
- Props typed with interfaces, not inline types
- Co-locate components in feature folders

```typescript
// components/invoice/InvoiceCard.tsx
interface InvoiceCardProps {
  invoice: Invoice;
  onEdit?: (id: string) => void;
}

export function InvoiceCard({ invoice, onEdit }: InvoiceCardProps) {
  // Component implementation
}
```

**Mobile Components**:
- React Native components (`View`, `Text`, `TouchableOpacity`)
- Use NativeWind `className` prop for styling
- StyleSheet for complex dynamic styles
- Never use HTML elements (`div`, `span`, `button`)

```typescript
// mobile/src/components/ui/ModernButton.tsx
import { View, Text, TouchableOpacity } from 'react-native';

export function ModernButton({ title, onPress }: ButtonProps) {
  return (
    <TouchableOpacity className="bg-blue-500 rounded-xl px-6 py-3" onPress={onPress}>
      <Text className="text-white font-semibold">{title}</Text>
    </TouchableOpacity>
  );
}
```

### Service Layer Pattern

**Always use services, never direct Supabase calls in components.**

```typescript
// ✅ GOOD: Component uses service
import { invoiceService } from '@/services/invoiceService';

function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  
  useEffect(() => {
    invoiceService.getInvoices(userId).then(setInvoices);
  }, [userId]);
}

// ❌ BAD: Component directly queries Supabase
import { supabase } from '@/integrations/supabase/client';

function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  
  useEffect(() => {
    supabase.from('invoices').select('*').then(...);  // Don't do this!
  }, []);
}
```

**Service Pattern**:

```typescript
// services/invoiceService.ts
import { supabase } from '@/integrations/supabase/client';
import type { Invoice, DatabaseInvoice } from '@/types';

export const invoiceService = {
  async getInvoices(userId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)  // snake_case
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Transform snake_case to camelCase
    return data.map(transformInvoice);
  },
  
  async createInvoice(invoice: CreateInvoiceInput): Promise<Invoice> {
    // Transform camelCase to snake_case for insert
    const dbInvoice: DatabaseInvoice = {
      user_id: invoice.userId,
      invoice_number: invoice.invoiceNumber,
      // ...
    };
    
    const { data, error } = await supabase
      .from('invoices')
      .insert(dbInvoice)
      .select()
      .single();
    
    if (error) throw error;
    return transformInvoice(data);
  }
};

function transformInvoice(db: DatabaseInvoice): Invoice {
  return {
    id: db.id,
    userId: db.user_id,
    invoiceNumber: db.invoice_number,
    createdAt: db.created_at,
    // ...
  };
}
```

### State Management

**Web**: React Context API
- Use `AppContext` for global app state
- Use `AuthContext` for authentication state
- Use local `useState` for component-specific state
- Use TanStack Query for server state caching

**Mobile**: Zustand
- Store slices in `/mobile/src/store/`
- Separate slices by domain: `authSlice`, `invoiceSlice`, etc.
- Use TypeScript for type safety
- Persist critical state (auth) with middleware

```typescript
// mobile/src/store/authSlice.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: false,
      signIn: async (email, password) => {
        // Implementation
      },
      signOut: async () => {
        // Implementation
      },
    }),
    { name: 'auth-storage' }
  )
);
```

### Design System: Revolut-Inspired UI

**Color Palette**:
- Primary: `#5B72EE` (Revolut blue)
- Secondary: `#4A5FD8` (darker blue)
- Accent: `#00D4FF` (cyan)
- Success: `#10B981` (emerald)
- Warning: `#F59E0B` (amber)
- Danger: `#EF4444` (red)
- Background: `#F8FAFC` (light gray)
- Text Primary: `#1E293B` (dark slate)
- Text Secondary: `#64748B` (medium slate)

**Component Styling**:
- Cards: `rounded-xl` or `rounded-2xl`, `shadow-sm`, white background
- Buttons: Primary (blue bg, white text), Secondary (white bg, blue border)
- Inputs: Light gray background (`#F8FAFC`), rounded borders
- Typography: Bold headings (700), medium body (500), clear hierarchy

**See**: `.cursor/rules/project-guide.mdc` for complete design system guidelines.

---

## Development Workflow

### Environment Setup

**Required Environment Variables**:

**Web** (`.env` or `.env.local`):
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Mobile** (`.env` in `/mobile`):
```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Development Commands

**Web**:
```bash
npm run dev          # Start dev server (Vite)
npm run build       # Build for production
npm test            # Run unit tests (Vitest)
npm run test:ui     # Test UI (Vitest)
npm run test:e2e    # Run E2E tests (Playwright)
npm run type-check  # tsc -p tsconfig.app.json and tsconfig.node.json
npm run lint        # ESLint
```

**Mobile**:
```bash
cd mobile
npm start           # Start Expo dev server
npm run android     # Run on Android
npm run ios         # Run on iOS
npm run lint        # ESLint (eslint-config-expo flat config)
npm run type-check  # tsc --noEmit
npm test            # Run Jest tests
npm run test:watch  # Tests in watch mode
```

### Code Organization

**Atomic Design Structure** (for components):
- `atoms/`: Basic building blocks (Button, Input, Badge)
- `molecules/`: Composed components (FormField, Card)
- `organisms/`: Complex components (InvoiceForm, Dashboard)
- `pages/`: Full page components

**Feature-Based Structure** (also used):
- Group by feature: `invoice/`, `expense/`, `payment/`
- Co-locate related files (component, styles, tests, types)

### Git Workflow

- Create feature branches from `main`
- Commit messages should be descriptive
- Run tests before committing
- Use conventional commits format recommended

---

## Common Tasks Guide

### Adding a New Feature

**1. Plan the Feature**
- Identify required database tables/columns
- Design component structure
- Plan service layer methods

**2. Database Changes**
- Create migration file in `/supabase/migrations/`
- Use snake_case for all names
- Add RLS policies
- Run migration locally

**Example Migration**:
```sql
-- supabase/migrations/YYYYMMDD_create_feature_table.sql
create table features (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

alter table features enable row level security;

create policy "Users can view own features"
  on features for select
  using (auth.uid() = user_id);
```

**3. Create TypeScript Types**
- Add types to `/src/types/` or `/mobile/src/types/`
- Match database schema (camelCase)

**4. Create Service Layer**
- Add service file: `/src/services/featureService.ts`
- Implement CRUD operations
- Handle errors and transformations

**5. Create Components**
- Build UI components in `/src/components/feature/`
- Use Revolut design system
- Add proper TypeScript types

**6. Create Page/Route**
- Add page component: `/src/pages/Feature.tsx`
- Add route in `src/routes.tsx`
- Connect to service layer

**7. Add Tests**
- Unit tests for service: `/src/services/__tests__/featureService.test.ts`
- Component tests: Co-locate with components
- E2E tests: `/tests/e2e/feature.spec.ts`

### Adding a Mobile Feature

**1-4. Same as Web** (database, types, service)

**5. Create Mobile Service**
- Add service: `/mobile/src/services/featureService.ts`
- Follow mobile service patterns (error handling, transforms)

**6. Create Screen**
- Add screen: `/mobile/src/screens/feature/FeatureScreen.tsx`
- Use React Native components
- Add navigation route in `/mobile/src/navigation/`

**7. Add to Store (if needed)**
- Create Zustand slice: `/mobile/src/store/featureSlice.ts`
- Add to store exports

**8. Add Tests**
- Jest tests: `/mobile/src/services/__tests__/featureService.test.ts`

### Modifying Database Schema

**1. Create Migration**
- Use descriptive filename: `YYYYMMDD_description.sql`
- Include `up` and `down` migrations if needed
- Test locally first

**2. Update TypeScript Types**
- Regenerate types: `npx supabase gen types typescript`
- Or manually update types in `/src/integrations/supabase/types.ts`

**3. Update Services**
- Modify service methods to handle new schema
- Update transformations

**4. Update Components**
- Modify UI to use new data structure

### Working with Invoices

**Key Files**:
- Service: `/src/services/invoiceService.ts`
- Components: `/src/components/invoice/`
- Pages: `/src/pages/CreateInvoice.tsx`, `/src/pages/EditInvoice.tsx`
- Types: `/src/types/index.ts` (Invoice interface)
- Templates: `/mobile/src/utils/invoiceTemplates.ts`

**Common Operations**:
- Create invoice: `invoiceService.createInvoice()`
- Get invoices: `invoiceService.getInvoices()`
- Update invoice: `invoiceService.updateInvoice()`
- Generate PDF: `pdfService.generateInvoicePDF()`

### Working with Payments

**Key Files**:
- Service: `/src/services/paymentService.ts`
- Components: `/src/components/payment/`
- Pages: `/src/pages/PaymentsPage.tsx`

**Payment Flow**:
1. Invoice created → payment record initialized
2. Payment captured → update invoice status
3. Payment reminders sent automatically

---

## Important Files Reference

### Entry Points

- **Web**: `src/main.tsx` - React DOM render, imports `App.tsx`
- **Mobile**: `mobile/index.ts` - Expo entry, imports `mobile/App.tsx`

### Routing

- **Web**: `src/routes.tsx` - React Router configuration with lazy loading
- **Mobile**: 
  - `mobile/src/navigation/index.tsx` - Root navigator
  - `mobile/src/navigation/AppNavigator.tsx` - Main app navigation
  - `mobile/src/navigation/AuthNavigator.tsx` - Auth flow navigation
  - `mobile/src/navigation/types.ts` - Navigation type definitions

### Configuration

- **Web**: `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`
- **Mobile**: 
  - `mobile/app.config.js` - Expo configuration
  - `mobile/tailwind.config.js` - NativeWind configuration
  - `mobile/tsconfig.json` - TypeScript config

### Supabase Client

- **Web**: `src/integrations/supabase/client.ts`
- **Mobile**: `mobile/src/services/supabaseClient.ts`

**Note**: Web client is auto-generated. Mobile client uses SecureStore for auth persistence.

### State Management

- **Web Context**: 
  - `src/context/StableAppContext.tsx` - App context
  - `src/context/StableAuthContext.tsx` - Auth context
- **Mobile Store**: `mobile/src/store/` (Zustand slices)

### Services (Key Examples)

- `src/services/invoiceService.ts` - Invoice CRUD operations
- `src/services/paymentService.ts` - Payment tracking
- `src/services/bankAccountService.ts` - Bank account management
- `src/services/taxCalculationService.ts` - Tax calculations
- `mobile/src/services/invoiceService.ts` - Mobile invoice service
- `mobile/src/services/customerService.ts` - Mobile customer service

### Documentation

- `README.md` - Project overview and setup
- `DESIGN.md` - Web Revolut-inspired and mobile Wise-inspired design systems
- `.cursor/rules/project-guide.mdc` - Comprehensive development rules
- `mobile/PLAY_STORE_CHECKLIST.md` - Mobile deployment checklist
- This file: `Agents.md` - LLM agent guide

---

## Database Schema

**Current fact (2026-09-03):** hosted `public` is empty. This section is the *application-expected* compatibility schema, not a live dump. Reconstruct via `.cursor/skills/ledgercraft-schema-rebuild/SKILL.md`. Target tenancy is `organisation_id` (see `TARGET_ARCHITECTURE.md`), not `auth.uid()`.

App code uses `line_items` (not `invoice_items`) and `bank_transactions` (not `transactions`).

### Key Tables

**Core Tables**:
- `invoices` - Invoice records
- `line_items` - Line items for invoices
- `customers` - Customer/client records
- `items` - Reusable items/products
- `expenses` - Expense records
- `payments` - Payment records (linked to invoices)
- `business_profiles` - Business/user profile information

**Supporting Tables**:
- `bank_accounts` - Bank account information
- `transactions` - Imported bank transactions
- `receipts` - Receipt records with OCR data
- `payment_accounts` - Payment account configurations
- `tax_configurations` - Tax settings per business
- `invoice_templates` - Custom invoice templates

### Row Level Security (RLS)

**Always enabled on user data tables**. Policies follow pattern:
```sql
create policy "Users can view own data"
  on table_name for select
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on table_name for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on table_name for update
  using (auth.uid() = user_id);
```

**Never bypass RLS in frontend code**. All security handled at database level.

### Query Patterns

**Always use services, never direct Supabase queries in components.**

**Good Pattern**:
```typescript
// Service layer
const invoices = await invoiceService.getInvoices(userId);

// Component
const [invoices, setInvoices] = useState<Invoice[]>([]);
useEffect(() => {
  invoiceService.getInvoices(userId).then(setInvoices);
}, [userId]);
```

**Bad Pattern**:
```typescript
// ❌ Don't do this in components
const { data } = await supabase.from('invoices').select('*');
```

### Foreign Key Relationships

Common relationships:
- `invoices.user_id` → `auth.users.id`
- `invoices.customer_id` → `customers.id`
- `invoice_items.invoice_id` → `invoices.id`
- `payments.invoice_id` → `invoices.id`
- `expenses.user_id` → `auth.users.id`

---

## Design System Guidelines

### Revolut-Inspired UI

**Color Palette** (use Tailwind classes or hex codes):

```typescript
// Primary brand colors
primary: '#5B72EE'      // bg-blue-500 or custom
secondary: '#4A5FD8'     // darker blue
accent: '#00D4FF'        // cyan

// Semantic colors
success: '#10B981'       // bg-emerald-500
warning: '#F59E0B'       // bg-amber-500
danger: '#EF4444'        // bg-red-500

// Neutral colors
background: '#F8FAFC'   // bg-slate-50
surface: '#FFFFFF'       // bg-white
textPrimary: '#1E293B'   // text-slate-800
textSecondary: '#64748B'  // text-slate-500
border: '#E2E8F0'        // border-slate-200
```

### Component Patterns

**Cards**:
```tsx
// Web
<div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
  {/* Content */}
</div>

// Mobile
<View className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
  {/* Content */}
</View>
```

**Buttons**:
```tsx
// Primary button
<button className="bg-blue-500 text-white rounded-xl px-6 py-3 font-semibold shadow-sm">
  Submit
</button>

// Secondary button
<button className="bg-white text-blue-500 border border-blue-500 rounded-xl px-6 py-3 font-semibold">
  Cancel
</button>
```

**Inputs**:
```tsx
<input 
  className="bg-slate-50 rounded-xl px-4 py-3 border-0 focus:ring-2 focus:ring-blue-500"
  placeholder="Enter text..."
/>
```

**Status Badges**:
```tsx
// Paid (green)
<span className="bg-emerald-100 text-emerald-700 text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full">
  ✓ Paid
</span>

// Draft (gray)
<span className="bg-gray-100 text-gray-700 text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full">
  📝 Draft
</span>
```

### Typography

**Headings**:
- H1: `text-2xl font-bold` (24px, 700)
- H2: `text-xl font-semibold` (20px, 600)
- H3: `text-lg font-semibold` (18px, 600)

**Body**:
- Default: `text-base font-normal` (16px, 400)
- Medium: `text-base font-medium` (16px, 500)
- Small: `text-sm font-normal` (14px, 400)

**Labels**:
- `text-xs font-medium uppercase tracking-wide` (12px, 500, uppercase)

### Animations

**Transitions**:
```tsx
className="transition-all duration-200"
```

**Common animations**:
- Button press: Scale to 0.95-0.98
- Page transitions: Slide-in from right (400-500ms)
- Fade-in: Opacity + translateY (200-300ms)

**See**: `.cursor/rules/project-guide.mdc` for complete design system details.

---

## Testing Strategy

### Web Testing

**Unit Tests** (Vitest):
- Location: `src/services/__tests__/`
- Test services and utilities
- Mock Supabase client
- Example: `invoiceService.test.ts`

**Component Tests** (React Testing Library):
- Location: Co-located with components or `src/components/__tests__/`
- Test user interactions
- Mock services and contexts

**E2E Tests** (Playwright):
- Location: `tests/e2e/`
- Test complete user workflows
- Real Supabase connection (test environment)
- Example: `transaction-import-simple.spec.ts`

**Running Tests**:
```bash
npm test              # Unit + component tests
npm run test:ui       # Vitest UI
npm run test:e2e      # E2E tests (requires dev server)
npm run test:coverage # Coverage report
```

### Mobile Testing

**Unit Tests** (Jest):
- Location: `mobile/src/services/__tests__/`
- Test services (mock Supabase)
- Test utilities

**Component Tests** (React Native Testing Library):
- Location: Co-located or `mobile/src/components/__tests__/`
- Test React Native components
- Mock navigation and services

**Test Setup**:
- `mobile/jest.config.js` - Jest configuration
- `mobile/jest.setup.js` - Test setup file
- `mobile/src/__tests__/setup/` - Test utilities

**Running Tests**:
```bash
cd mobile
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### Test Best Practices

1. **Isolation**: Each test should be independent
2. **Mocking**: Mock external dependencies (Supabase, APIs)
3. **Coverage**: Aim for >80% coverage on services
4. **Real E2E**: E2E tests use real Supabase (test database)
5. **Cleanup**: Clean up test data after tests

---

## Deployment & Build

### Web Deployment

**Build**:
```bash
npm run build  # Creates /dist folder
```

**Deployment Platforms**:
- **Vercel**: Automatic from Git pushes
- **Netlify**: Automatic from Git pushes

**Environment Variables** (set in deployment platform):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**PWA Configuration**:
- `vite-plugin-pwa` handles service worker
- Manifest: `public/manifest.webmanifest`
- Icons: `public/icons/`

### Mobile Deployment

**EAS Build** (Expo Application Services):
```bash
cd mobile

# Production build
npm run build:android

# Preview build (for testing)
npm run build:android:preview

# Development build (with Expo Go)
npm run build:android:development
```

**EAS Submit** (to stores):
```bash
npm run submit:android  # Submit to Google Play
```

**Configuration**:
- `mobile/app.config.js` - Expo configuration
- `mobile/eas.json` - EAS build profiles

**Environment Variables**:
- Set in EAS secrets or `.env` file
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_ORG=ledgercraft` (set on the preview and production profiles in `mobile/eas.json`; leave the DSN unset locally, in Jest, and in CI)
- `SENTRY_AUTH_TOKEN` (optional EAS secret; uploads source maps; builds succeed without it)
- `SENTRY_PROJECT=ledgercraft-mobile` (already set in `mobile/eas.json`)

**Store Requirements**:
- See `mobile/PLAY_STORE_CHECKLIST.md` for complete checklist
- App icons, splash screens, privacy policy
- Store listings and screenshots

### Version Management

**Web**: Uses `package.json` version
- Auto-versioning scripts: `scripts/auto-version.js`
- Version displayed in app footer

**Mobile**: Uses `mobile/app.json` version
- Update `version` and `buildNumber` for each release
- iOS: `ios.buildNumber` (CFBundleVersion)
- Android: `android.versionCode`

### Pre-Deployment Checklist

**Web**:
- [ ] Run `npm run type-check` (no TypeScript errors)
- [ ] Run `npm test` (all tests pass)
- [ ] Run `npm run build` (build succeeds)
- [ ] Test production build locally
- [ ] Environment variables set in deployment platform

**Mobile**:
- [ ] Run `npm test` in `/mobile`
- [ ] Test on physical devices (iOS + Android)
- [ ] Update version numbers
- [ ] Update store listings
- [ ] EAS secrets configured
- [ ] Icons and splash screens updated

---

## Quick Reference

### Common Import Paths

**Web**:
```typescript
import { supabase } from '@/integrations/supabase/client';
import { invoiceService } from '@/services/invoiceService';
import { useAuth } from '@/context/StableAuthContext';
```

**Mobile**:
```typescript
import { supabase } from '@/services/supabaseClient';
import { invoiceService } from '@/services/invoiceService';
import { useAuth } from '@/store';
```

### Common Patterns

**Fetching Data**:
```typescript
// Web (with TanStack Query)
const { data, isLoading } = useQuery({
  queryKey: ['invoices', userId],
  queryFn: () => invoiceService.getInvoices(userId),
});

// Mobile (with Zustand or direct)
const [invoices, setInvoices] = useState([]);
useEffect(() => {
  invoiceService.getInvoices(userId).then(setInvoices);
}, [userId]);
```

**Error Handling**:
```typescript
try {
  const result = await invoiceService.createInvoice(data);
  // Success
} catch (error) {
  console.error('Error creating invoice:', error);
  // Show error to user
}
```

### File Naming Conventions

- Components: `PascalCase.tsx` (e.g., `InvoiceCard.tsx`)
- Services: `camelCase.ts` (e.g., `invoiceService.ts`)
- Hooks: `useCamelCase.ts` (e.g., `useInvoices.ts`)
- Types: `camelCase.ts` or `index.ts` (e.g., `invoice.ts`)
- Tests: `*.test.ts` or `*.test.tsx`

---

## Reconstruction agents

Parent chat is Orchestrator. Launch specialists with Task `generalPurpose` using `.cursor/skills/ledgercraft-agent-roster/SKILL.md`. Session start: `.cursor/skills/ledgercraft-bootstrap/SKILL.md`.

| Agent | Owns |
| --- | --- |
| Knowledge Steward | `TARGET_ARCHITECTURE.md`, this file, `.cursor/skills`, `.cursor/rules` |
| Platform | pnpm workspace, Compose/local Postgres, Vite `/api` proxy, API health |
| Schema | Drizzle baseline, roles, RLS, compatibility tables |
| Contracts | `packages/contracts` Zod DTOs |
| API | `api/src/modules/*` vertical slices |
| Auth | Better Auth, memberships, sessions |
| Web | `src/` Query hooks and UI |
| Mobile | `mobile/` Query hooks and screens |
| Verification | Vitest, RLS tests, Playwright, RN tests, live smoke (`ledgercraft-verify`) |

**Waves:** W0 knowledge (done) → W1 platform scaffolding (**verified**) → W2 compatibility schema (**verified**) → W3 identity (**verified**) → W4 customers (**verified**) → W5 invoices (idempotency + share, **verified**) → W6 payments/expenses/accounts (**verified**) → W7 bank/recon/tax (**verified**) → W8 storage/email/AI (**verified**) → W9 client consolidation (**verified**) → W10 leftover-screen rewire (**done**) → W11 journals / accounts write / reminders (**verified**) → W12 chat completions (**verified**) → W13 supabase-js burn (**verified**, 2026-09-11).

**TDD:** failing tests first; real Postgres for SQL/RLS. **Knowledge:** a wave is not done if docs are stale.

### Git / handoff (read before coding)

| Ref | What is there |
| --- | --- |
| `origin/mobile-app` @ `fd62f9a` | W0 + W1 scaffolding only. |
| `mobile-app` local `33cf075` | W2 compatibility schema. Ahead of origin until pushed. |
| `mobile-app` local `b758b32` | W3 identity (Better Auth, `/api/me`). Ahead of origin until pushed. |
| `mobile-app` local | W4 customers CRUD on Hono (working tree until committed). Push when asked. |

### What W1 shipped (in `fd62f9a`)

- pnpm workspace: `api`, `packages/contracts` (`mobile/` not in workspace)
- Hono healthz/readyz, error envelope, request IDs
- Compose Postgres host **55432**, roles `ledgercraft_migrator` / `_app` / `_readonly`
- Probe table `rls_probe` + FORCE RLS (`api/drizzle/0000_framework.sql`)
- Vite `/api` → `127.0.0.1:3001`
- Tests: contracts, health, RLS probe

**Gotcha:** migrator must have `CREATE` on database `ledgercraft` so Drizzle can create schema `drizzle`. Init SQL now grants it. Existing volumes need: `GRANT CREATE ON DATABASE ledgercraft TO ledgercraft_migrator;`

### What W2 shipped (working tree, verified)

Compatibility product schema reconstructed from `src/types` Supabase\* interfaces and service mappers. **Not** a replay of `supabase/migrations` or `migrations/*.sql`.

- Inventory: `api/src/db/schema/compatibility-inventory.ts`
- SQL: `api/drizzle/0001_compatibility.sql` (org RLS helper `ledgercraft_apply_org_rls`)
- Tests: every listed column exists; invoice money is `NUMERIC`; customers isolated by `organisation_id` under `ledgercraft_app`

Tables: `customers`, `business_profiles`, `item_categories`, `items`, `invoices`, `line_items`, `accounts` (chart of accounts), `account_templates` (global, no org RLS), `expense_categories`, `expenses`, `payments`, `receipts`, `tax_configurations`, `tax_returns`, `tax_adjustments`, `journal_entries`, `journal_entry_lines`, `shared_invoices`, `conversations`, `conversation_messages`, `bank_accounts`, `bank_transactions`, `reconciliation_*`, `transaction_import_batches`, `account_contacts`.

Decisions already locked:

- Tenant key is `organisation_id` + `user_id` (Lane A name) on tenant tables
- Invoice `payment_status` includes `partially_paid`; `balance_due` is a normal `NUMERIC` column (not generated)
- Money is `NUMERIC`, never float
- Drizzle **TS table defs** for most product tables are **not** written yet (W2 shipped SQL + inventory; W3 identity tables; W4 added `customers`). Add Drizzle tables when a slice needs them.
- Clients still talk to hosted Supabase via `supabase-js`

### What W3 shipped (working tree, verified)

Hono binds a Better Auth session to `app.user_id` + `app.organisation_id`. Web and mobile email login/signup use Better Auth. Mobile persists the session cookie in SecureStore. Do **not** authorize product data with both session systems.

- SQL: `api/drizzle/0002_identity.sql` — `users`, `sessions`, `auth_accounts`, `verifications`, `organisations`, `organisation_memberships`
- Drizzle: `api/src/db/schema/identity.ts`
- Better Auth email/password in `api/src/modules/auth/` (Drizzle adapter, UUID ids)
- Sign-up provisions an owner organisation + membership
- `GET /api/me` (and `/me`) returns the session DTO from `packages/contracts`
- Unauthenticated `/api/me` → 401 `{ error: { code, message, requestId } }`
- FORCE RLS on organisations (by `id`) and memberships; Better Auth tables have DML grants and no tenant RLS
- Product `accounts` is unchanged (chart of accounts). Provider accounts are `auth_accounts`

### Verify (this machine already passed)

```bash
pnpm install
pnpm db:up
pnpm verify:w8          # alias of verify:w1; contracts + API + typecheck
pnpm dev:api            # 127.0.0.1:3001
pnpm dev                # Vite :8080, proxies /api
curl -s localhost:8080/api/healthz
curl -s localhost:8080/api/me
```

`.env.example` has the database URLs, `BETTER_AUTH_*`, and `VITE_CUSTOMERS_API` / `EXPO_PUBLIC_CUSTOMERS_API`. Tests fall back to defaults if `.env` is missing. Vitest uses `ledgercraft_test` so `withTestDb` TRUNCATE cannot wipe accounts in `ledgercraft`.

### What W4 shipped (working tree, verified)

Customers CRUD through Hono, scoped to the session organisation. Ownership IDs come from the session, never the body. Web invoices still use `supabase-js` (including nested `customers(*)` embeds). Web `/login` and `/signup` use Better Auth email/password.

- Contracts: `packages/contracts/src/customer.ts` — camelCase DTO, strict create body (rejects `organisationId` / `userId`)
- API: `api/src/modules/customers/` + Drizzle `api/src/db/schema/customers.ts` (W2 SQL, no new migration)
- `GET/POST /api/customers`, `GET/PATCH/DELETE /api/customers/:id` — unauthenticated → 401 envelope; cross-org get → 404
- Web: `src/features/customers/` Query hooks; `customerService` CRUD uses Hono when `VITE_CUSTOMERS_API=true`
- Mobile: `mobile/src/services/customerService.ts` CRUD uses `EXPO_PUBLIC_API_URL` when `EXPO_PUBLIC_CUSTOMERS_API` is not `false`. Email auth is Better Auth (`mobile/src/features/auth/api`). React Native cannot read `Set-Cookie`; the API exposes `set-auth-token` (bearer plugin) and the mobile cookie jar stores it in SecureStore.
- Rollback flags: `VITE_CUSTOMERS_API`, `EXPO_PUBLIC_CUSTOMERS_API`

**W4 out of scope (still):** TanStack Router, `apps/` move, UI redesign.

### W5 status (invoices)

Web and mobile invoice create/list/status/send is Hono: sequence lock, line items, server GST totals, balanced journal, payment terms, percent or fixed discount. `POST /api/invoices` stays `draft`. `Idempotency-Key` replay returns the original invoice; a reused key with a different body is 409 `IDEMPOTENCY_CONFLICT`. `POST /api/invoices/:id/share` snapshots the invoice; public `GET /api/public/invoices/:token` is 404 when expired, inactive, or unknown. Client-supplied totals are rejected. Cross-org get/share is 404. Cloudflare-ready: `Dockerfile`, Pages Function `/api` proxy, NetworkOnly PWA for `/api`.

### W6 status (payments / expenses / accounts)

Expenses, expense categories, invoice payments, and chart-of-accounts list are Hono. Money stays string `NUMERIC`. Ownership IDs come from the session. `POST /api/payments` inserts the payment and recomputes invoice `total_paid` / `balance_due` / `payment_status` in one organisation transaction; amount above `balanceDue` is 400 `PAYMENT_EXCEEDS_BALANCE`. Cross-org expense/payment reads are 404. `GET /api/accounts` lists the org chart (journal create still seeds AR/GST/Sales). Rollback: `VITE_EXPENSES_API`, `VITE_PAYMENTS_API`, `VITE_ACCOUNTS_API`, `EXPO_PUBLIC_EXPENSES_API`, `EXPO_PUBLIC_PAYMENTS_API`, `EXPO_PUBLIC_ACCOUNTS_API`.

### W7 status (bank / recon / tax)

Bank accounts, parsed transaction import, reconciliation persist, and tax config/returns are Hono. CSV parse and auto-match stay on the client. Import body is `{ bankAccountId, transactions }`; duplicate skip is same date + description + amount. `POST /api/payments`-style money stays string `NUMERIC`. `reconciliation_matches.confidence_score` is stored 0–1 and exposed 0–100. Completing a session with |difference| ≥ 0.01 is `400 RECONCILIATION_UNBALANCED`. `GET /api/tax-configurations` creates NZ GST `0.15` when missing. Cross-org bank/recon/tax reads are 404. Mobile has no dedicated bank/tax/recon screens. Rollback: `VITE_BANK_API`, `VITE_RECONCILIATION_API`, `VITE_TAX_API`.

### W8 status (storage / email / AI)

Object uploads, payment receipts, receipt-scan AI, and invoice send mailer are Hono. Tests inject a memory object store; local runtime uses the filesystem (`OBJECT_STORE_DIR` or `api/.data/objects`). Keys are `{organisationId}/{receipts|logos}/{uuid}.ext`. `GET /api/objects?key=` streams bytes; other orgs get 404. `POST /api/receipts` `{ paymentId }` snapshots payment+invoice JSON and issues `REC-YYYYMM-####`. `POST /api/ai/receipt-scan` uses `OPENAI_API_KEY` on the API; missing scanner is `503 AI_UNAVAILABLE`. Invoice send uses Resend when `RESEND_API_KEY` is set, otherwise logs. Share/reminder email no longer calls Edge Functions. Conversations persist on Hono. Chat completions use `POST /api/ai/chat`. Rollback flags still exist for Vitest stubs. Restart Vite after changing flags.

### W9 status (client consolidation)

Conversations CRUD + messages are Hono (`GET/POST /api/conversations`, `POST /api/conversations/:id/messages`, `PATCH/DELETE /api/conversations/:id`). Ownership IDs are rejected on create/update. Cross-org get is 404. Web `conversationService` and conversation actions use Hono when flags are on. Dashboard, accounting, simple tax, and financial reports load invoices/expenses/payments/accounts from existing list APIs when those flags are on. `useAppData` reads lists from TanStack Query when domain flags are on; `DataManagerSOLID.initialize` skips those fetches. Rollback: `VITE_CONVERSATIONS_API` (`=== 'true'`). Do not start TanStack Router or `apps/` until leftover stubbed client SQL is gone if you want a clean cut.

### W10 status (leftover-screen rewire)

IRD/GST/tax widgets already had Hono forks; period rows now expose `tax_amount` / `expense_date` aliases so those screens do not read `0` GST from camelCase DTOs. `ExpenseGSTSummary` and `EnhancedExpensesPage` accept Hono or PostgREST shapes. `getAccounts` uses `GET /api/accounts` when the accounts flag is on. `/signup-classic`, `ConversationContext`, `/auth/callback`, and `/confirm-email` use Better Auth (`StableAuthContext` / `getMe`), not `supabase.auth`.

### W11 status (journals / accounts write / reminders)

Journals CRUD is Hono (`GET/POST /api/journal-entries`, `GET/PATCH/DELETE /api/journal-entries/:id`). Create writes two balanced lines as `draft`; ownership IDs are rejected; cross-org get is 404. `POST /api/accounts`, `PATCH /api/accounts/:id`, and `POST /api/accounts/initialize` seed 1110/1120/1200/2200/2300/4000/4100 when `account_templates` is empty. `POST /api/invoices/:id/remind` sends mail and does **not** change invoice status. Web journal UI and `accountManagementService` use those APIs when flags are on. Payment reminders always go through Hono.

### W12 status (chat completions)

`POST /api/ai/chat` takes `{ messages: [{ role, content }] }` and returns `{ content }`. Missing completer is `503 AI_UNAVAILABLE`. Unauthenticated is 401 envelope. Runtime injects OpenAI when `OPENAI_API_KEY` is set. Web `aiService` and receipt scanning call Hono; they do not call `api.openai.com` or `VITE_OPENAI_*`.

### W13 status (supabase-js burn)

`@supabase/supabase-js` is removed from root and `mobile/package.json`. Web `src/integrations/supabase/client.ts` and `mobile/src/services/supabaseClient.ts` are local stubs (no hosted URL, no anon JWT). Edge Function `send-invoice-email` URLs are gone. Vitest still sets domain flags `false` so leftover `supabase.from` tests hit the stub. Do not add the SDK back.

### Hard no (still)

- Replay Git SQL in order
- New client `supabase.from` / Storage SDK / Edge Function / `VITE_OPENAI_*`
- Better Auth **and** Supabase sessions both authorizing data
- Commit unless asked

## Additional Resources

- **Target architecture**: `TARGET_ARCHITECTURE.md`
- **Session start**: `.cursor/skills/ledgercraft-bootstrap/SKILL.md`
- **Project skills**: `.cursor/skills/ledgercraft-*/SKILL.md`
- **Project Rules**: `.cursor/rules/project-guide.mdc` - Comprehensive development guidelines
- **README**: `README.md` - Project setup and overview
- **Mobile Guide**: `mobile/README.md` - Mobile-specific documentation
- **Play Store Checklist**: `mobile/PLAY_STORE_CHECKLIST.md` - Mobile deployment guide

---

**Last Updated**: 2026-09-11
**Version**: 1.10.0
