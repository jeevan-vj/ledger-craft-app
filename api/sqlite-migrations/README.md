# SQLite baseline

`0000_initial.sql` is the reviewed greenfield Cloudflare SQLite schema generated
from `api/src/db/schema`. It does not replay the PostgreSQL or Supabase history.
The SQL is suitable for SQLite-backed Durable Object `storage.sql.exec`; apply
it through the explicit authenticated deployment migration operation, inside a
storage transaction. Use `PRAGMA foreign_keys = ON` when verifying with Node
SQLite (Cloudflare SQLite enables foreign keys).

Run `node api/sqlite-migrations/verify.mjs` from the repository root. It exercises
real SQLite constraints and exact decimal round trips without a hosted service.
Generate later reviewed changes from `api/` using
`drizzle-kit generate --config drizzle.sqlite.config.ts`. Do not regenerate or
rewrite the baseline once deployed. UUIDs are assigned by the Drizzle runtime;
raw SQL inserts must supply IDs. Timestamps are milliseconds since epoch;
Drizzle maps them to JavaScript Date. JSON columns are encoded TEXT.

Money remains decimal TEXT. Never SUM, add, compare magnitude, or cast it to
SQLite REAL for accounting calculations: use the existing exact decimal helpers.
Nonnegative amount and positive quantity checks inspect decimal characters rather
than converting to floats. API contracts enforce precision and applicable rates.

Each tenant-owned table has an organisation index. Tenant relationships use
composite foreign keys `(organisation_id, parent_id)` to prevent references into
another organisation; parents expose a matching unique `(organisation_id, id)`.
Optional relationships use RESTRICT instead of SET NULL because nulling the
composite organisation key would break ownership. Delete workflows must explicitly
clear optional relationships within a transaction. Invoice-line, receipt,
conversation-message and other owned-child relationships retain CASCADE.
The trusted API gateway must seed the authenticated user, organisation and
membership before serving a tenant database. SQL has no PostgreSQL RLS: isolation
comes from the tenant-specific Durable Object plus authenticated server routing
and repository organisation predicates.

The baseline preserves invoice/journal number uniqueness, idempotency scopes,
share tokens, auth emails/tokens, membership uniqueness, and core domain checks.
Better Auth provider accounts are unique by `(provider_id, account_id)`; the
compatibility issuer column defaults to `credential` for password registration.
There are no global template seed records in the existing API migrations;
chart-of-account initialization remains the existing API use case.
