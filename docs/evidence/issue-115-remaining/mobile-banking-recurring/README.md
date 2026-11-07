# Mobile banking, CSV/reconciliation and recurring templates

Scope: #21, #22 and #28. Verified locally on 7 November 2026
(Pacific/Auckland). No native device, real provider delivery or deployment is
claimed. The parent report records the final combined gates and browser evidence.

## Implemented

- Bank accounts identify the persisted default payment account. Detail uses the
  server movement summary (opening, inflows, outflows, movement, closing) and
  paginated transactions; no client balance recomputation is introduced.
- Transfers offer different-currency destinations with an explicitly selected,
  dated and immutable reviewed rate. Both legs and rounding stay server-owned.
  Unsupported currency pairs and missing eligible rates cannot be submitted.
- The native CSV picker supports explicit date/description/amount or debit-credit
  mapping, date-format selection, row-level errors and duplicates before apply.
  Invalid rows block import; ambiguous rows with both debit and credit are
  rejected. Preview renders20 rows per page. Existing-duplicate preview is bounded
  to5,000 rows, visibly disclosed; the server still checks all applied rows.
  Uploaded CSVs are capped at1MiB. Cancellation keeps the previous selection.
- Account detail creates and lists persisted statement sessions, permits resume
  after reload, and offers supported bank-side timing/error adjustments. Fees,
  interest and book corrections require actual posted transactions. Existing
  authoritative summary, stale-review and completion guards are retained.
  Read-only users cannot complete statements through this view.
- Recurring invoice, supplier bill, income and expense forms support create/edit,
  exact line inputs, additional invoice/bill lines, schedule interval/custom unit,
  start/end/occurrence limit/timezone/local-time/month-end controls and actual
  server next-run previews. Run history exposes generated invoice/bill links,
  failures, delivery messages and next attempts. Pause/resume/end explain their
  effect. Automatic email can only be enabled when configured; an existing choice
  can still be disabled while unavailable. Discounts and tax identities retain
  the correct original line when an earlier line is removed.
- Bank mutations refuse offline writes with explicit retry guidance. Bank screen
  mutations use `networkMode: always` so TanStack Query does not silently queue
  them to post after connectivity returns. Existing server idempotency and
  duplicate guards remain authoritative.

## Accounting and tenancy corrections found during this work

Recurring template creation/update previously ignored `Idempotency-Key`.
Concurrent create retries now replay the exact original response; reuse with
changed input returns409. Scopes include company, user, method and canonical
path, using the existing key table. Omitted headers remain optional. Statement-session setup and signed bank-side
adjustments also retain stable client keys and server replay guards. Lost-response
retries cannot double the adjustment. Fresh writes to completed statements remain
blocked; replaying an existing accepted request adds no new record.

Independent review also reproduced a material scheduler defect: a template in
company A used its creator's currently selected company B when creating the
occurrence. Expense generation could silently post into B; invoice/bill/income
sources in A instead failed to resolve. Removed or demoted creators and archived
companies also continued to generate. Seven real HTTP/SQLite regression tests
failed before the correction and passed afterward.

Generation now uses explicitly bound `InTx` document use cases for all four
kinds. It verifies current membership, company state and the creator's schedule
and document permissions. Cloud execution additionally consults authoritative
Identity before creating/preparing/finalizing a job, because Ledger membership
mirrors can be stale. Permission denial pauses the schedule for administrator
review. Provider/RPC calls remain outside ledger transactions. Delivery prepares
and finalizes the company A invoice and share without changing the creator's
active company selection. Each generated kind retains an occurrence idempotency
record, including expenses and income. Actual invoice email acceptance remains
separate from unit/provider contract verification.

## Expected versus actual local checks

| Check | Expected | Actual |
| --- | --- | --- |
| Exact form text |9007199254740993.01 retains every digit |Passed |
| Reviewed FX transfer |Missing rate blocks; selected persisted ID reaches API |Passed |
| Mapped CSV |Unusual headers/date format work; invalid row remains visible; both debit/credit rejected |Passed |
| Recurring invoice/bill requests |Shared DTO validation accepts exact lines and full schedule |Passed |
| Removing an earlier template line |Retained line keeps its own discount and tax ID |Passed |
| Read-only statement view |Summary available, completion hidden |Passed |
| Concurrent recurring create |One template and replayed response; changed-body409 |Passed |
| Scheduler A while creator selects B |All four kinds remain in A; selection remains B |Passed |
| Revoked/demoted/archived creator |No generated document; denied job pauses |Passed |
| Bound auto-delivery |A invoice and A public share, live authorization at each boundary |Passed using an in-process test mailer |

## Verification

Final mobile scoped Jest passed14 suites/43 tests, including the offline
banking regression. All-project verification belongs in the parent report. API scoped recurring verification passed6 files/21 tests,
including the7 reviewer-authored organisation regressions. API TypeScript passed.
Final scoped mobile ESLint reported0 errors/0 warnings. Raw red and green captures accompany this
report; initial failures are not represented as passes.

The reproducible browser driver is
`scripts/issue115-mobile-banking-recurring-proof.mjs`. It signs up a synthetic
company, creates multi-line invoice and supplier-bill templates, verifies NZ
month-end dates and once-only generation, checks bank default/movements and
pagination, creates/resumes a zero-difference statement, maps a CSV with duplicate
review and performs an explicitly reviewed NZD/USD transfer. Final actual Expo390×844 browser verification passed. Four unique documents were
generated; invoice115.02/GST15, persisted default/movements906.03, pagination,
resumed statement with zero difference, mapped CSV (one new/one duplicate), and
reviewed16NZD→10USD all matched. The CSV uncovered stale displayed balances: the
new import12.10 must change906.03 to918.13, then the transfer leaves902.13.
Two real API regressions failed before the exact once-only balance fix and
direction-aware duplicate guard; the final browser run passed against that fix.
[Final screenshots and results](browser/). Earlier picker attempts used the wrong
icon-bearing selector/inactive DOM; the final run uses the actual filechooser
event and real CSV bytes, with no picker mock.

## Device checks pending

Installed iOS and Android: document-provider cancellation/read, large CSV mapping
and scrolling, keyboard/large text, native navigation/back protection, app
background/restart during statement review, offline save/retry and generated
invoice/bill deep links. Expo-web screenshots cannot establish those behaviors.
No native dependency or runtime fingerprint change was introduced in this slice.
