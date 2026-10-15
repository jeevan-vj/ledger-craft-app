---
name: ledgercraft-tdd
description: Test-driven workflow for LedgerCraft reconstruction. Use when implementing API modules, schema, Query hooks, auth, money/GST, RLS, or any vertical slice. Requires failing tests before production code.
---

# LedgerCraft TDD

No production code for a slice until a failing test exists for that slice.

## Order

1. **Contract** — Zod request/response tests in `packages/contracts`.
2. **API integration** — real PostgreSQL, migrations applied, `ledgercraft_app` role. Do not mock Drizzle for SQL, constraints, transactions, or RLS.
3. **Use case unit** — pure calculations, permissions, rounding. Mock repositories only here.
4. **Query hook / component** — Testing Library; mock HTTP, not the database.
5. **Playwright / mobile** — after the API is green for that domain.

## Red → green → refactor

- Write the smallest failing test that names the gate (e.g. "retried invoice create returns original result").
- Implement only enough to pass.
- Refactor under green. Split files before they exceed ~400 lines.

## Where tests live

| Kind | Location |
| --- | --- |
| Contract | `packages/contracts` beside schemas |
| API module | `api/src/modules/<domain>/<domain>.test.ts` |
| RLS | API integration suite using `ledgercraft_app`, not the migrator role |
| Web component | colocated `*.test.tsx` |
| Mobile | `mobile/src/**/__tests__` |
| E2E | `tests/e2e/` |

## Required invoice-gate cases (W5)

1. Cross-organisation read/write fails.
2. Retried create with same idempotency key returns the original result.
3. Invoice, lines, sequence, journal commit or roll back together.
4. Client-supplied totals cannot override server totals.
5. Share token expiry/active rules do not leak other rows.

## Verify commands

After the tests are green, prove the feature with `.cursor/skills/ledgercraft-verify/SKILL.md` (UI/PDF: `ledgercraft-verify-ui`).

```bash
pnpm install
pnpm db:up
pnpm verify:w13         # W1–W13.
```

Postgres host port is `55432`. API tests use `DATABASE_URL` (app role) and `DATABASE_MIGRATE_URL` (migrator). Do not mock Drizzle in `api/src/test`.

## W3 identity gates (proven)

1. Unauthenticated protected route returns 401 with `{ error: { code, message, requestId } }`.
2. Session + membership binds `set_config('app.organisation_id', …)` inside the use-case transaction.
3. `ledgercraft_app` cannot read another organisation's memberships/org rows.
4. Better Auth provider-account table is **not** named `accounts` (that name is the chart of accounts).

## Forbidden

- Skipping tests because "the UI proves it".
- Mocking Drizzle in tests meant to prove SQL.
- Adding Playwright that talks to hosted empty Supabase.
- Shipping a route without the standard error envelope `{ error: { code, message, requestId } }`.
