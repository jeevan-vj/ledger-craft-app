---
name: ledgercraft-bootstrap
description: Start-here operating instructions for LedgerCraft reconstruction. Use at the beginning of any session, when verifying W1, continuing W2+, launching specialist agents, or when the user mentions reconstruction, Hono, verify, pnpm workspace, or lost database.
---

# LedgerCraft bootstrap

Read this before writing code. Then follow the named skill for the wave you are on.

## You are here (2026-09-11)

| Fact | Detail |
| --- | --- |
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
| Git | `origin/mobile-app` includes W4 customers. Working tree also has web Better Auth plus Hono through W13. |
| Clients | Web and mobile email login/signup → Better Auth (`/api/auth/*`). Product CRUD including journals, account writes, reminders, receipt-scan, and chat → Hono. `@supabase/supabase-js` is not installed. |

## Pickup

1. Read `AGENTS.md` § Reconstruction agents (TanStack Router / `apps/` only after leftover stubbed client SQL is gone if you want a clean cut).
2. If this clone does not contain `src/features/journals/api/journalsApi.ts`, W11 is missing.
3. Commit/push if origin is behind and the user asks.

## First command

```bash
pnpm install
pnpm db:up
pnpm verify:w13
```

If `pnpm-lock.yaml` changes, commit it. Next: TanStack Router / `apps/` only after leftover stubbed client SQL is gone if you want a clean cut. Dev smoke:

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
| Postgres host port | **55432** (container 5432). Avoids other stacks on 5432. |
| `DATABASE_URL` | `postgres://ledgercraft_app:app@127.0.0.1:55432/ledgercraft` |
| `DATABASE_MIGRATE_URL` | `postgres://ledgercraft_migrator:migrator@127.0.0.1:55432/ledgercraft` |
| `DATABASE_ADMIN_URL` | `postgres://postgres:postgres@127.0.0.1:55432/ledgercraft` (local only) |
| Test DB | `ledgercraft_test` — Vitest only. `withTestDb` TRUNCATE stays off the app DB. |
| `API_PORT` | `3001` |

API process uses the **app** role. Migrations and test seed use the **migrator** role. Never connect the API as superuser, `BYPASSRLS`, or table owner.

## Layout (do not move yet)

```text
src/                     web (Vite). Stays here until W9.
mobile/                  Expo. Not in the pnpm workspace yet.
api/                     Hono + Drizzle + tests
packages/contracts/      Zod DTOs only
docker/postgres/init/    roles
api/drizzle/             0000 probe + 0001 compatibility + 0002 identity + 0003 terms + 0004 idempotency/share
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
