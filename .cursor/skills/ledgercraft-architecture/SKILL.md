---
name: ledgercraft-architecture
description: Enforces LedgerCraft TARGET_ARCHITECTURE.md non-negotiables for Hono, Drizzle, Better Auth, Query, and client boundaries. Use when adding API routes, data access, auth, storage, email, AI, or any feature that could talk to Postgres or providers.
---

# LedgerCraft architecture

Read `TARGET_ARCHITECTURE.md` before implementing. `docs/agent-operations.md` describes how we work; this skill is what must stay true.

## Required request path

```text
Client → Hono route → use case → repository → Drizzle → PostgreSQL
```

Never: component → Supabase/PostgREST, client → Drizzle, client → OpenAI/Resend, route handler with unrelated SQL plus business logic.

## Non-negotiables

1. Clients receive Zod DTOs, never Drizzle rows or credentials.
2. Ownership IDs come from the session and active membership, never from the request body.
3. Use cases own transactions and business rules. Repositories accept a transaction handle and issue queries only.
4. TanStack Query owns server state. Zustand/context own client-only state.
5. Money is `NUMERIC` in Postgres. Authoritative totals are computed on the server. Do not ledger-calculate in JS `number`.
6. Mutations that can retry need an idempotency strategy.
7. Production schema changes are reviewed SQL in Git. No `drizzle-kit push` to prod. No migrations on API boot.
8. Do not mix UI redesign, TanStack Router migration, `apps/` directory moves, and a data-plane cutover in one change.

## Reconstruction constraints (2026-09)

- Hosted `public` schema is empty. Data and identities are gone.
- Do not replay `supabase/migrations` or `migrations/*.sql` in order.
- Derive compatibility columns from `src/types` and service mappers.
- Prefer organisation-owned rows (`organisation_id`) on Lane B. Lane A compatibility `user_id` is temporary.
- Skip preserving old `auth.users` UUIDs. There are none to preserve.

## New work checklist

- [ ] Shared Zod schema in `packages/contracts`
- [ ] Hono route + use case + repository in one module folder (~400 lines)
- [ ] Query hook; no new `supabase.from`
- [ ] Integration test on real Postgres
- [ ] Knowledge Steward update (see `ledgercraft-knowledge-sync`)
