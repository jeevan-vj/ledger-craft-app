# Accountant close-pack API acceptance

This is **real authenticated Hono / SQLite API acceptance**, using the synthetic
October NZ services books from the independently prescribed month-close fixture.
It is not browser/native UI acceptance; the parent evidence records those runs.

`GET /api/reports/close-pack?from=2026-10-01&to=2026-10-31` returns one private,
non-cached ZIP attachment. Dates must be real, ordered, unfiltered and bounded to
one financial-year interval. Company identity comes from the authenticated active
membership, never a query parameter. Both reports and banking read permission
are required: member is denied, read-only/accountant/admin/owner are allowed.

The archive contains six report CSVs, general-ledger CSV, canonical financial /
ledger JSON, bank reconciliation JSON/CSV, GST settings/current preparation and
original retained GST snapshots, accounting cutoff metadata, README and manifest.
Financial reports use accrual accounting; GST preparation follows the registered
GST basis, so payments/hybrid GST can differ from invoice-basis ledger controls.
It contains CSV/JSON working papers, not newly generated PDFs or an IRD submission.
Existing individual report PDF exports are unaffected.

All DB snapshots are read inside **one organisation transaction**. Canonical
`financialReportInTx`, extracted unchanged `generalLedgerInTx`, GST preparation
and bank summary services supply every figure. There is no alternate financial
calculation. ZIP serialization/checksums happen after that read transaction.
The archive never closes/reopens periods, posts journals or rewrites GST records.

## Actual assertions

- Closing TB13,680 each side, balance-sheet assets12,480, profit1,500,
  cash11,380, AR920/AP575 in the correct CSV members.
- Five matched bank lines; completed statement/book closing11,380 and difference0.
- Current GST225 and the exact original retained draft calculation fingerprint.
- Export remains readable after the October accounting cutoff is closed at revision1.
- Full financial report data before and after export is unchanged.
- Reopen, add a credit, reverse it in October, then reclose: GST remains225 but
  additive source IDs change the current fingerprint. The original draft is
  unchanged and the manifest explicitly warns that its fingerprint differs.
  Identical current/retained snapshots do not get a false stale warning.
- Manifest checksums and sizes match every non-manifest member; Python `zipfile`
  independently verifies the retained [API example](api-example.zip) and its
  [manifest](manifest.json):14 members,13 checksummed content members.
- A second empty company sees none of the original company's figures or GST records.
- Unauthenticated/invalid/filtered requests fail. Member without banking read gets403;
  read-only with both permissions gets200. A customer name `=1+2` is escaped in CSV.
- Missing GST settings produce `preparation:null` and explicit warnings, not guessed0.
  Unclosed periods, missing bank coverage and absent filed GST confirmations remain
  explicit preparation warnings. Original draft/filed source snapshots remain intact.

## Test-first and checks

Node24.22.1, pnpm11.19.0:

| Command | Exit | Observed result |
| --- | --- | --- |
| Contracts `vitest run src/close-pack.test.ts` before schema | 1 | Missing feature/schema module |
| Same contract tests after implementation | 0 | 2 passed |
| API `vitest run src/modules/reports/close-pack.test.ts` before route | 1 | Expected200, actual400 from unsupported legacy report type |
| Same API tests after implementation | 0 | 2 passed |
| Pack + reports + report-columns + cash-flow-reconciliation regression | 0 | 4 files /11 tests passed |
| API/contracts `pnpm type-check:api` | 0 | No diagnostics |
| Same-total changed-source warning before / after correction | 1 /0 | 1 failed/1passed →4files/11tests passed |
| Final archive-production acceptance rerun | 0 | 2 passed; actual ZIP retained |

Logs preserve red/green outcomes. The parent runs complete CI-matching gates.
The small `generalLedgerInTx` extraction reuses the prior callback verbatim,
replacing only the organisation-context parameter; canonical ledger tests remain green.

A direct API dependency on `fflate0.8.2` is declared. The existing workspace store
is used; the initial default-store mismatch was resolved without changing global
package-manager configuration. No applied migration is changed by this slice.
