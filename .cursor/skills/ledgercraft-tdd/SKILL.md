---
name: ledgercraft-tdd
description: Test-driven workflow for LedgerCraft. Use when implementing a slice, fixing a bug, or changing money, GST, auth, or API behaviour. Write a failing test before production code.
---

# LedgerCraft TDD

No production code for a slice or a bug fix until a failing test exists for that behaviour.

Prove the result with `ledgercraft-verify` before a pull request. UI changes also follow `ledgercraft-verify-ui`. Domain rules are `ledgercraft-invariants`.

## Bug fix

1. Write the smallest test that fails on the current code for the reported reason. Name the behaviour ("retried invoice create returns the original total"), not the patch.
2. Run that test. Paste the failure, including the assertion and the exit code.
3. Change only the production code needed to make that test pass.
4. Run the same test again. Paste the pass.
5. If you cannot write a failing test, stop and say why. Do not add the test after the fix and call it test-first.
6. A UI bug also needs a phone-width check at 390×844 with screenshots (`ledgercraft-verify-ui`).

## Feature order

1. **Contract** — Zod request and response tests in `packages/contracts`.
2. **API integration** — temporary SQLite via `api/src/test/setup-env.ts` and `withTestDb` in `api/src/test/harness.ts`. Migrations in `api/sqlite-migrations/` apply in name order. Do not mock Drizzle for SQL, constraints, or transactions. Do not start Docker Postgres.
3. **Use case unit** — pure calculations and permissions. Mock repositories only here.
4. **Query hook or component** — Testing Library. Mock HTTP, not the database.
5. **Browser or mobile** — after the API test for that domain is green.

Organisation isolation is the membership bind plus repository predicates (`api/src/test/rls.test.ts`). SQLite has no Postgres RLS and no `ledgercraft_app` role in these tests.

## Red, green, refactor

- Implement only enough to pass the failing test.
- Refactor while the test stays green. Split a file before it grows past ~400 lines.

## Where tests live

| Kind | Location |
| --- | --- |
| Contract | `packages/contracts`, beside the schema |
| API module | `api/src/modules/<domain>/<domain>.test.ts` |
| Organisation isolation | `api/src/test/rls.test.ts` and the module test |
| Web component | colocated `*.test.tsx` |
| Mobile | `mobile/src/**/__tests__` or `*.test.ts` next to the module |
| Browser | `tests/e2e/` when a browser test already exists for that flow |

## Invoice and quote cases

1. Another organisation cannot read or write the row.
2. The same idempotency key and body returns the original result. A different body with that key is 409 `IDEMPOTENCY_CONFLICT`.
3. Invoice, lines, sequence, and journal commit or roll back together.
4. Client-supplied totals do not override `computeInvoiceTotals`.
5. Share-token expiry and active rules do not leak other rows.

## Identity cases

1. An unauthenticated protected route returns 401 `{ error: { code, message, requestId } }`.
2. The session's membership selects the organisation. The body cannot.
3. The Better Auth provider-account table is not named `accounts` (that name is the chart of accounts).

## Do not

- Skip the failing test because the UI looks right.
- Mock Drizzle in a test that claims to prove SQL.
- Point a browser test at hosted Supabase.
- Ship a route without `{ error: { code, message, requestId } }`.
- Delete or loosen an assertion, or edit a snapshot, to go green.
