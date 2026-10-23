---
name: ledgercraft-vertical-slice
description: Migrates one LedgerCraft domain into a Hono vertical slice with shared Zod contracts and TanStack Query hooks. Use when adding or cutting over customers, items, invoices, expenses, payments, or similar domains.
---

# Vertical slice

One domain per change. File budget ~400 lines. Split by use case, not by a global `controllers/` folder.

## Layout (after workspace exists)

```text
packages/contracts/src/<domain>.ts
api/src/modules/<domain>/
  <domain>.routes.ts
  <domain>.service.ts
  <domain>.repository.ts
  <domain>.test.ts
src/features/<domain>/   or current src/ until apps/web move
  api/
  hooks/
  components/
mobile/src/features/<domain>/  same contracts, RN UI
```

Do not move `src/` → `apps/web` or `mobile/` → `apps/mobile` until every protected path uses Hono.

## Slice steps (TDD)

1. Knowledge Steward: name the domain, list current `supabase.from` call sites.
2. Contracts: Zod DTOs + contract tests.
3. Verification: failing API integration tests.
4. Schema: only if columns/constraints are missing (expand/migrate/contract).
5. API: repository → use case → route. Standard error envelope.
6. Web Query hooks; delete that domain from DataManager/context/Zustand server cache.
7. Mobile Query hooks; delete SQL-bearing service methods for that domain.
8. Verification: `ledgercraft-verify` (the CI commands, with pasted output) then `ledgercraft-verify-ui` for the happy path and one authz failure. Check `ledgercraft-invariants` when the slice touches money, tokens, or SQL.
9. Knowledge sync skill.

## Feature flag

Per-domain capability flag with rollback. Do not use a single `VITE_API_URL` as the only switch.

## Invoice slice extra rules

Create is one transaction: sequence lock or `UPDATE … RETURNING`, lines, server totals, balanced journal, idempotency record. A journal failure rolls back the invoice.

## Done when

- No `supabase.from('<table>')` remains for that domain in web or mobile app code
- Clients import DTOs from contracts, not Drizzle
- `AGENTS.md` and `TARGET_ARCHITECTURE.md` current-status mention the domain as cut over
