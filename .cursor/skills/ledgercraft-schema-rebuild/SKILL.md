---
name: ledgercraft-schema-rebuild
description: Reconstruct LedgerCraft PostgreSQL from application TypeScript contracts after the live database was lost. Use when writing Drizzle schema, baselines, roles, RLS, or restoring tables the current clients expect.
---

# Schema rebuild

The live `public` schema is gone. Git SQL is incomplete and internally conflicting. Application types are the contract.

## Sources of truth (priority)

1. `src/types/index.ts`, `src/types/payment.ts`, `src/types/bankTransaction.ts` and `Supabase*` interfaces
2. Insert/select mappers in `src/services/supabaseService.ts` and domain services
3. Generated `src/integrations/supabase/types.ts` (stale, 12 tables only)
4. `supabase/migrations/*.sql` and `migrations/*.sql` as **hints only**

## Do not

- Apply existing SQL files in chronological order onto empty Postgres
- Trust both `payments` / `expenses` definitions (tax SQL vs accounting SQL vs app types disagree)
- Recreate `auth.uid()` RLS as the long-term model on Lane B
- Put provider URLs in rows as durable identifiers

## Conflicts — prefer the app

| Topic | Prefer |
| --- | --- |
| Expenses | `expense_date`, `category_id`, `vendor_name`, `is_billable`, `account_id`, `status`, `currency` |
| Invoice payment status | app/accounting: `partially_paid` |
| `balance_due` | computed in the use case or a non-generated column until Drizzle baseline is reviewed |
| `business_profiles.theme` | JSONB, required by mappers, missing from generated types |
| Invoice extras | `template_name`, `additional_charges*`, `public_viewed_at` |
| Line items | `rate_unit` |

## Two schemas, one database

**Lane A (compatibility):** tables and columns current `supabase-js` clients already write (`user_id`, existing names) so local GoTrue + PostgREST can boot the old UI.

**Lane B (target):** Drizzle baseline with `organisation_id`, Better Auth `users`, `FORCE ROW LEVEL SECURITY`, roles:

```text
ledgercraft_migrator  owns objects; migrations only
ledgercraft_app       no table ownership; DML grants only
```

Add `organisation_id` as soon as Hono owns the table. Do not wait for a later rewrite.

## Inventory before DDL

Produce a table/column/FK/index list from TypeScript, then generate Drizzle + reviewed SQL. Restore into empty Postgres and run schema tests that assert columns the app selects exist.

## Tables the app uses (minimum)

`business_profiles`, `customers`, `invoices`, `line_items`, `items`, `item_categories`, `profiles`, `accounts`, `account_templates`, `expenses`, `expense_categories`, `payments`, `receipts`, `tax_configurations`, `tax_returns`, `tax_adjustments`, `journal_entries`, `journal_entry_lines`, `shared_invoices`, `conversations`, `conversation_messages`, `bank_accounts`, `bank_transactions`, `reconciliation_sessions`, `reconciliation_matches`, `reconciliation_adjustments`, `transaction_import_batches`

Plus Lane B: `organisations`, `organisation_memberships`, Better Auth identity tables. Better Auth must **not** create a table named `accounts` — that name is the chart of accounts (W2). Use `auth_accounts` (or equivalent) and configure the adapter.

## Money

`NUMERIC`, never float. CHECKs: quantity > 0, rate >= 0, amounts >= 0 where applicable. Unique `(organisation_id, invoice_number)` on Lane B.
