# Company accounting-period cutoff

Implementation uses additive SQLite migrations0035/0036, two company-scoped metadata tables,
shared Zod contracts, and the existing authenticated accounting route mount.
No money formula, invoice totals helper or applied SQL migration was changed.

## Public API and policy

- `GET /api/accounting-periods`: cutoff, optimistic revision, role capabilities and
  newest-first retained audit events. Reading/exporting closed books remains available.
- `POST /api/accounting-periods/close`: `{through,reason,reviewed:true,expectedRevision}`.
  Owner/admin/accountant may advance the cutoff; future dates are rejected using
  the organisation's calendar day. Closing writes metadata only.
- `POST /api/accounting-periods/reopen`: `{from,reason,reviewed:true,expectedRevision}`.
  Owner/admin only. The new cutoff is the previous day; `0001-01-01` explicitly
  reopens all accounting. Earlier periods remain closed on a partial reopen.
- Both mutation routes accept `X-Expected-Organisation-ID` as an assertion only.
  A stale active-company form fails409 `ORGANISATION_CHANGED`; body IDs never select
  the company. A different stale revision fails409 `STALE_ACCOUNTING_PERIOD`.
- Exact lost-response retries recover the immediately retained matching event
  (same actor, previous revision, action, cutoff and reason); they never append a
  second event. Older or different mutations require refresh and review.
- Changed global financial policies lack effective dates. GST registration/basis/
  calendar, tax configuration, base currency/timezone/financial-year policy require
  accounting to be fully reopened before changing them. Display-only localisation
  remains editable. Versioned prospective policy transitions are not invented here.
- Recording an unchanged saved GST draft as externally filed remains available;
  source calculations/snapshots cannot be changed by that confirmation. Read-only
  original-settings recalculation does not change closed books.

## Guard map

| Boundary | Protection |
| --- | --- |
| `accounting/posting.ts` | All `postBalancedEntry` callers and purchase-journal helpers use the same date guard; reversing an original closed posting requires reopening, even if the requested counter date is later. |
| `invoices/invoices.journal.ts` | Direct invoice posting guards after an existing-journal replay lookup; cancellation/restore insertions also guard dates. An old draft cannot first reach October's ledger through a November receipt or delayed email completion. |
| `invoices/invoices.service.ts` | New drafts and financial edits enforce original/new document dates; closed-draft send preflight rejects before external transport. Resending an already paid/cancelled/sent document preserves its existing financial status. Notes/terms-only metadata stays separate. |
| `invoices/invoice-lifecycle.service.ts` | Mutating cancellation/restore requires original period open; existing no-op returns still recover safely. |
| `expenses/expenses.service.ts` | New/pending/approved financial edits and deletion of closed sources are blocked; notes-only metadata remains available. |
| `journals/journals.service.ts` | Closed-date draft creation/post/delete blocked; already-posted no-op PATCH returns the original entry without changing metadata. |
| `payments/payments.service.ts` | New receipts enforce receipt date; original closed receipt reversal blocked; existing idempotency-key recovery occurs before the date guard. |
| `purchases/purchases.service.ts` | Bill create/edit/receive/void/restore/delete and supplier-payment/reversal effective/original dates guarded; completed receive/void no-op returns preserved. |
| `credit-notes/*.service.ts` | Issue/refund dates and original reverse dates guarded; exact already-accepted reversal retries return before cutoff validation. Different-body reversals remain409. |
| `invoice-imports/invoice-import-review.service.ts` | Reviewed commit checks source issue date before either sales or direct purchase-draft insertion; no closed-date import bypass. |
| `bank/bank.service.ts` | Financial account identity/balance changes protected; closed-source split/document allocation cannot mutate settlement caches. Attachment-only metadata stays available. Other bank posting/reversal paths use the central guard. |
| `tax/gst-calendar-lock.ts`, `tax/tax.service.ts`, `currency/currency.service.ts` | Shared source-affecting profile/GST settings guard, saved tax draft financial mutations, and global financial policy changes protected. |
| Parent-owned `accounts/accounts.service.ts` | Financial identity changes for accounts with posted history through the cutoff are guarded; unused accounts can still be classified. |

New November receipts or credit notes against already posted October invoices are
allowed and do not rewrite October trial balance, P&L, balance sheet, cash flow,
GST or aging. An October draft which was not posted before close is different:
it must not first create an October journal through that later receipt.

A fiscal reopen does **not** reopen a completed bank statement. Existing bank-cash
cutoff controls remain independent; an October cash correction may still require
bank-statement handling after the general fiscal cutoff is reopened.

The Worker already routes this prefix through Identity's active-company dispatch
into the company Ledger DO; it is not an Identity-owned financial state endpoint.
Parent-owned actual local Worker acceptance validates that deployment boundary.

## Test-first evidence and verification

Node24.22.1; real Hono, ordinary signup/source commands and temporary SQLite.
No Drizzle mocks. The extraction/import regression uses the existing deterministic
mock extraction fixture and real SQLite commit route.

- Contract red: missing contract module; green2tests validate real dates, reasons,
  reviewed confirmation, revision and rejection of body company IDs.
- Initial API red: missing period routes. Core green validates close/role/reopen/
  tenant/unchanged historical books/November source operations.
- Natural close retry red: stale409 instead of recovering one retained event.
- Receipt recovery red: a recorded idempotent receipt was blocked after close.
- Send preflight red: closed draft reached unavailable transport503 instead of409.
- Direct invoice journal red: old draft → November receipt and delayed delivery
  completion both inserted October postings; both now409 with atomic rollback.
- Legacy source bypass red: purchase import201 and bank allocation200 after close;
  both now409 and leave source state unchanged.
- Paid delivery red: completing an already paid invoice resend changed it to sent;
  completion now preserves the original non-draft status and timestamp.
- Exact reversal/no-op red: two accepted credit/refund reversals and completed
  lifecycle recovery were blocked; they now recover without new journal lines.

Final command:

```
pnpm --filter @ledgercraft/api exec vitest run \
 src/modules/accounting/period-lock.test.ts \
 src/modules/invoice-imports/invoice-imports-phase2.test.ts \
 src/modules/accounting/recovery.test.ts \
 src/modules/reports/full-month-close.e2e.test.ts \
 src/modules/tax/gst-settings.test.ts \
 src/modules/payments/payments.test.ts \
 src/modules/invoices/invoice-lifecycle.test.ts
```

Exit0: **7 files, 41 tests passed**, including12period cases and4import cases.
`pnpm type-check:api`: exit0, API/contracts no diagnostics.
`node api/sqlite-migrations/verify.mjs`: exit0, exact decimals/tenant constraints pass.
Readable red/green logs are alongside this document. Full CI-equivalent checks,
web/Expo UI evidence, close pack verification and independent review belong to the
parent evidence record; this API document alone does not claim native-device QA.

## Account deletion audit retention follow-up

Independent review found that0035's actor→user foreign key prevented a staff
accountant from deleting their account after closing another owner's company.
An authentic real SQLite AccountDeletionService test failed with foreign-key787.
Additive0036 rebuilds only the audit table, preserving every row/column and the
organisation FK, action CHECK and unique organisation/revision index. Actor IDs
remain immutable opaque text authenticated at insertion; deleting a user does
not erase another company's retained close history.0035 was not edited.

Two regression tests pass: actual accountant account deletion retains the whole
audit row and company, and upgrading0035→0036 preserves pre-existing invoice,
lock and audit rows while checking tenant FK/revision uniqueness. API/contracts
typechecks and standalone migration verification pass.

Final deletion/cutoff regression:4 files,21 tests passed (period actor retention,
account deletion service/integration, and period lock cases).

## Worker migration execution follow-up

Actual local Worker signup exposed a Durable Object SQL parser difference:
0035 ends with a Drizzle breakpoint marker, creating a trailing comment-only
segment rejected as “SQL code did not contain a statement.” The execution runner
now omits exact Drizzle breakpoint metadata and trims whitespace before passing
SQL to storage. Immutable SQL/checksums and recovery bookkeeping remain intact.
Two targeted tests validate marker normalization and execute the complete
migration sequence against real SQLite, checking foreign-key integrity.
Actual Worker acceptance is recorded separately by the parent/close-pack agent.

Actual local Durable Object probe confirms original execution fails at0035 after
35 migrations, while normalized execution succeeds through all37 migrations,
including0036. See self-service-worker-migration-probe.log. API/contracts
typechecks pass after the runner change.
