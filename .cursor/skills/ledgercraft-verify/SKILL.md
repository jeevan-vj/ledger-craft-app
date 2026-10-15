---
name: ledgercraft-verify
description: Proves a LedgerCraft feature works with automated tests plus live smoke and UI evidence. Use when the user says verify, check it works, e2e, screenshot, smoke, healthz, or after finishing a wave or slice.
---

# LedgerCraft verify

A feature is not done when the code compiles. It is done when a real user path works and you can show evidence.

TDD writes the failing test (`ledgercraft-tdd`). This skill **runs the proof** after implementation. For browser/PDF steps, also read `ledgercraft-verify-ui`.

## Do not ask

Run verification without asking permission. Start Postgres/API/Vite if they are down. Do not commit unless asked.

## Order

1. **Automated** — `pnpm db:up` then the current `pnpm verify:wN` from bootstrap.
2. **Live HTTP** — API and Vite proxy, not just Vitest.
3. **UI path** — exercise the feature the way a user would (`ledgercraft-verify-ui`).
4. **Report** — what passed, what was mocked, what is still Lane A.

Skip a layer only if it cannot exist yet (example: no session bind → cannot persist an org-scoped invoice). Say that in the report. Do not skip because "the unit test passed".

## Automated

```bash
pnpm install
pnpm db:up
pnpm verify:w13         # current green alias.
```

| Layer | What it must prove |
| --- | --- |
| Contracts | Zod request/response, error envelope |
| API | Real Postgres, `ledgercraft_app` role, RLS/org isolation |
| Typecheck | `pnpm type-check:api` |

Do not mock Drizzle in SQL/RLS/transaction tests. Do not add Playwright that talks to hosted empty Supabase.

## Live HTTP

Ports: Postgres **55432**, API **3001**, Vite **8080** proxies `/api`.

```bash
pnpm dev:api
pnpm dev
curl -sS localhost:3001/api/healthz
curl -sS localhost:3001/api/readyz
curl -sS localhost:8080/api/healthz
curl -sS localhost:8080/api/me
```

Expect `{ "status": "ok" }` on health/ready. Unauthenticated `/api/me` → 401 `{ error: { code, message, requestId } }`. Unknown `/api` path → same envelope with `NOT_FOUND`.

Migrator on an old volume needs `GRANT CREATE ON DATABASE ledgercraft TO ledgercraft_migrator`.

## What "works" means by surface

| Surface | Pass |
| --- | --- |
| Schema/wave | `verify:wN` green + tables/columns exist on `55432` |
| Auth | Sign-up/sign-in via Better Auth; `/api/me` returns `userId` + `organisationId` |
| CRUD slice | Create/list/get/update/delete through Hono; second org cannot read the row |
| Invoice totals | Server GST/totals; client numbers cannot override |
| Invoice PDF | Preview shows the same numbers as the downloaded `%PDF` file |
| Protected UI | Logged-out `/invoices` and `/customers` redirect to `/login` |

Web and mobile email login/signup are Better Auth. Web customers, business profile, items, invoices go through Hono (including share tokens). Mobile customers and invoices go through Hono with a SecureStore cookie jar. Do not authorize product data with both Better Auth and Supabase sessions.

## Evidence

Save artifacts under `/tmp/ledgercraft-verify-<feature>/`. Report:

```text
Verified:
- Automated: <command> <pass/fail>
- Live: <endpoints and status>
- UI: <path taken, screenshots>
- Persistence: Hono+Postgres | mocked session | not exercised
- Gaps: <what still talks to hosted Supabase or is untested>
```

Then run `ledgercraft-knowledge-sync` if wave status or cutover facts changed.
