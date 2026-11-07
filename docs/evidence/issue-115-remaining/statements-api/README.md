# Customer statements and automatic reminders — issue110

Implemented locally on7 November2026 (Pacific/Auckland). Synthetic Hono/SQLite
records and stubbed mail transport only; no real customer email was sent.

## Accounting behavior

`GET /api/customers/:id/statement?type=open_items|activity&from&to` returns
company-base NZD decimal strings. Activity statements retain opening and running
balances from dated posted journals, including invoice/receipt/credit/refund
reversals and multi-invoice bank reconciliation ancestry. Open-items statements
show outstanding invoices plus a separate retained customer-credit balance.
They do not add unlike source currencies. Financial source amounts and existing
journals remain unchanged.

The existing report engine's `buildAging` produces the aging buckets. A working
paper invoices1,000 in September and receives400 in October: opening1,000,
October closing600, and1–30-day aging600. A November reversal restores1,000;
October remains600. Another company settles1,000, then receives a200 customer
credit: its balance is−200. A50 November refund leaves−150 while October stays
−200. Bank reconciliation of400 followed by a November undo similarly restores
1,000 without changing the earlier600 balance. Tests assert report-aging parity,
not a second independent aging formula.

Internal journal descriptions, credit reasons and refund notes are not printed
on shared statements. Lines use a standard movement label and invoice number.

## Statements, sharing and delivery

- Seven-day immutable snapshots use random public tokens; only SHA256 token
  hashes are stored. Public access checks expiry, revocation and active company.
- Owner/admin/accountant sharing and revocation are enforced server-side.
  Readers can preview statements but cannot create public shares or send mail.
- `sendStatement` uses the same server mail transport with canonical statement
  values and a secure snapshot link. Web PDF rendering/export is a separate
  parent-owned client concern; this API emails the link, not a PDF attachment.
- Single and bulk sending accept `Idempotency-Key` and reuse the existing
  `idempotency_keys` table. Bulk replay retains its original selected outcomes,
  including zero-balance skips even if later books change. Per-customer provider
  keys are SHA256-derived and scoped to that batch. Different-body key reuse is
  rejected409. Failed delivery replay returns502; an uncertain in-progress claim
  returns409 and is not blindly resent.
- Bulk results distinguish sent, failed and zero-balance skipped counts. A real
  HTTP test sends one eligible statement, skips one zero-balance customer and
  proves retries do not send again, even after that customer's later invoice.

## Scheduled reminders

Settings persist enabled state, IANA timezone, local time, up to10 unique named
steps with distinct offsets and gentle/firm/final templates. Supported
placeholders are `{customer}`, `{invoiceNumber}`, `{amountDue}`, `{dueDate}` and
`{payLink}`. Customer/invoice opt-outs and invoice reminder logs have shared APIs.
Enabling requests the existing Ledger alarm hook; root integration drives the
scheduler alongside recurring transactions and bank feeds.

The scheduler rechecks unpaid issued active invoices and opt-outs, claims each
invoice/step atomically before network I/O, and uses a stable provider key. An
active owner/admin/accountant in the same organisation creates a verified public
invoice share; it never relies on that user's mutable active-company selection.
Unshareable legacy invoices are logged for source review. Paid, draft, cancelled
and opted-out invoices are not sent. An Auckland8:59 run waits;9:00 becomes
eligible, including daylight-saving conversion. Parallel/retried alarms send
one step once. Later full settlement prevents remaining scheduled steps.

Unavailable email records `skipped: email_unavailable` once per step. Missing
email and unsupported invoice share have separate reasons. Failed sends are
recorded; uncertain claimed delivery remains `sending` for human review. No
automatic resend follows such a claim. Disabled or missed historical steps are
not backfilled: only today's configured offsets are eligible. Delivery or
inbox acceptance with a real provider remains unverified.

## Test-first evidence and checks

Feature contracts and API imports initially failed before implementation.
Additional red reproductions caught bank-reconciliation undo attribution,
internal-note exposure, empty public pay links and bulk replay after a previously
zero-balance customer's books changed. The final scoped run and raw logs are
stored in this directory. Final results: **10 real Hono/SQLite collection tests,
1 transport test and12 existing Resend tests passed (23 total)**; contracts2
tests passed; API TypeScript exit0; scoped ESLint exit0 with0 errors/0 warnings.
Commands: `pnpm --filter @ledgercraft/api exec vitest run
src/modules/customer-statements/customer-statements.test.ts
src/modules/customer-statements/collections-mailer.test.ts
src/modules/invoices/resend.test.ts`,
`pnpm --filter @ledgercraft/contracts exec vitest run src/customer-statements.test.ts`,
`pnpm --filter @ledgercraft/api type-check`. The parent evidence records complete repository gates and
browser/PDF screenshots after integration.

New migration0029 contains only the four new collections tables and indexes.
It was generated by Drizzle against a temporary current-schema baseline rather
than replaying stale historical metadata. Existing SQL is unchanged. The parent
regenerates the deployment manifest after all wave migrations are ready.

Local scope: Node24.22.1/pnpm11.19.0 API tests; contracts on Node24.22.1. No
production deploy, native-device run or provider credential claim is made.

Cloud scheduling accepts a trusted live Identity actor as a sixth parameter.
An explicit null stops processing and scheduling before claims or mail; a
provided actor must also have an eligible local membership mirror. It never
falls back to a stale Ledger actor after Identity denies access. Undefined keeps
the local Node behavior. Real SQLite tests cover denial, foreign actors and a
valid explicit actor. Parent integration supplies the live Identity decision.
