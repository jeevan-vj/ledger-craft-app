# Add collections, cash reporting, receipt capture and mobile business workflows

Businesses could not prepare customer statements or automate reminders, cash P&L omitted settled invoice revenue, and mobile banking/recurring/reporting workflows lacked key controls. Web and Expo now expose retained statements/PDFs, reminder preferences/history, server period-column reports, reviewed receipt capture, full recurring templates and mapped CSV/reconciliation/FX workflows. Bank imports update displayed balances once, and background jobs remain bound to the owning company with current Identity permission checks.

Refs #115, #110, #112, #25, #113, #21, #22, #28, #108, #87. The earlier GST implementation is the parent commit. #114 stays parked by explicit user instruction. This does **not** close the entire epic: Akahu Full App, several Stripe money paths, live providers and native acceptance remain open.

The change also adds an internal gated Akahu Personal App adapter and Stripe provider-retrieved verification/refund operations, beta approval, persistent rate limits and read-only daily discovery. No real provider transaction, email, deployment, filing or store release occurred.

## Accounting evidence

- Web statement:230 +1,150 −575 −115 =690; later receipt115 changes current books to575 while the shared snapshot/PDF retain690. Expo statement1,000 −400 =600.
- Consultancy accrual profit1,500 −300 =1,200; cash profit700 −300 =400. Assets6,425 = liabilities225 + equity6,200; cash5,460; receivables920. Monthly columns agree to standalone periods.
- Recurring month-end Jan31→Feb28→Mar31 generates four unique documents; invoice115.02/GST15. CSV imports one new12.10 and skips one duplicate; reviewed16NZD→10USD leaves source902.13 and destination10.00.
- Stripe simulator:100 payment −4.30 platform fee =95.70 clearing. A refund request waits for verified webhook confirmation; confirmed refund restores invoice100 and clearing0.

[Working papers, remaining work, screenshots, PDFs and raw logs](docs/evidence/issue-115-remaining/README.md). Actual desktop1440×900, phone390×844 and Expo browser flows passed against local Hono/SQLite. Most web captures useb6264eb0537c; the report-table-only responsive correction is verified ona00595275d99. No static mock is represented as real persistence or installed-device evidence.

## Verification

pnpm11.19.0; all checks below exited0 locally. Remote CI is separate.

| Command | Node | Actual result |
| --- | --- | --- |
| `pnpm test:api` |24.22.1 |133 files /596 tests passed |
| `pnpm test:contracts` |24.22.1 |44 files /161 tests passed |
| `pnpm type-check:api` |24.22.1 |API/contracts clean |
| `pnpm test:run` |22.23.4 |165 files /866 tests passed |
| `pnpm type-check` |22.23.4 |App/Node projects clean |
| `pnpm lint` |22.23.4 |0 errors /120 warnings |
| `pnpm build` |22.23.4 |Verified0.0.8 /a00595275d99;314 app source-map entries match |
| Mobile Jest /types /lint |20.20.2 |143 suites /647 tests passed;0 errors /74 warnings |
| Mobile iOS export |20.20.2 |Hermes bundle exported; no installed-device run |
| CI readiness /web sourcemap checker |22.23.4 |23+3 tests passed; parity report exits0 with gaps still reported |
| SQLite verification |22.23.4 |Schema/decimal/tenant constraints pass |
| Pages /Worker types /Worker dry-run |22.23.4 |Compiled; nothing deployed |
| Actual local Worker readiness +Identity/Ledger RPC |22.23.4 |5 passing entries |

The four complete product suites total2,270 passing tests. Existing Jest worker teardown, lint and build warnings remain visible. No quality gate was suppressed, no forceExit flag was introduced, and original fixture assertions were retained. Earlier diagnostic failures and authentic red/green regressions are disclosed in the evidence.

## Review, rollout and risk

**Risk: high.** Shared DTOs, migration/schema, money/reporting, auth permissions, background jobs and Worker paths need human/CODEOWNERS review. [Independent initial review and builder resolutions](docs/evidence/issue-115-remaining/REVIEW.md) disclose reviewer-authored reproducer tests. All confirmed findings are fixed and tested, including cross-company scheduling, actual fee-event shape, accepted-email cancellation/edit races and stale imported bank balances. Final independent re-review remains pending after the review session was interrupted; no author approval or auto-merge eligibility is claimed.

Migrations0029–0034 are additive/generated; applied historical SQL is unchanged. Receipt APIs retain legacy numeric scan responses unless modern clients opt into exactAmounts. A reviewed rollback must retain schema, financial history, feed-source compatibility and required provider revocation/webhook handlers; a blind code revert can reject new feed rows. Disable new provider operations before rollback rather than deleting history.

Remaining work is explicit: Akahu multi-user OAuth/accreditation/native lock; Stripe payout/dispute/processing-fee/excess-capture accounting, replaced-link lifecycle and QR polling acceptance; production provider configuration/live acceptance; installed iOS/Android file/camera/print/share, keyboard and background QA. The Stripe evidence includes concrete journal proposals for the unresolved financial policies. #114 remains parked. No issue is automatically closed by this local wave.
