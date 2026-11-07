# Remaining issue #115 flows — implementation and verification

7 November 2026, Pacific/Auckland. Branch `codex/issue-115-remaining-flows`,
based on the earlier GST commit `d56bb6b`. The user authorised work across the
remaining roadmap and explicitly kept #114 parked. This is local implementation
and synthetic accounting verification; it does not declare the entire epic closed.

## Delivered in this wave

| Area | Implemented | Evidence |
| --- | --- | --- |
| #110 collections | Historical open-items/activity statements, aging, retained hashed/expiring shares, PDFs, idempotent single/bulk email, reminder schedules/templates/opt-outs/logs; web and Expo | [API](statements-api/README.md), [web](statements-web/), [Expo](mobile-collections/README.md) |
| #112/#25 reports | Server monthly/quarterly columns, business-calendar/NZ presets, comparison, account/party filters, CSV/PDF, exact drill-down and Expo workspace | [Reports](reports/README.md) |
| #113 receipts | Batch upload/review inbox, PDF extraction, exact scan proposals, duplicate review, explicit save, retained files/retry/manual fallback, scoped role-safe upload/read/delete, real Expo photo workflow | [Receipts](receipts/README.md) |
| #21/#22 banking | Saved default payment account, exact movement/pagination, reviewed FX, mapped CSV preview/errors/duplicates, idempotent apply and resumable statement setup/adjustments | [Mobile banking](mobile-banking-recurring/README.md) |
| #28 recurring | Full invoice/bill template editing, limits/timezone/month-end preview, lifecycle/history/deep links; idempotent creation/update and company-bound generation | [Recurring](mobile-banking-recurring/README.md) |
| #108 Akahu | Gated internal Personal App adapter, exact parsing, provider IDs, account/legacy mapping, daily/rest limits, revocation, deletion hook and connection summaries | [Bank feeds](bankfeeds/README.md) |
| #87 Stripe | Authoritative provider retrieval, balance/verification/refund/audit UI, exact fee reversals, beta approval, persistent limits and daily read-only discovery | [Stripe and acceptance matrix](stripe/README.md) |

Migrations0029–0034 are generated additive changes. Existing applied SQL stays
unchanged. New provider secrets are never sent to clients. No real email, card
charge, bank connection, deployment, store release or IRD submission occurred.

## Accounting checks: expected equals actual

These are separate isolated companies with independently specified books.

| Working paper | Expected / actual |
| --- | --- |
| Web customer statement | Opening230 + invoiced1,150 − receipt575 − credit115 = closing690. Aging current460 +31–60days230. PDF and anonymous retained share690; later receipt115 makes current575 while the shared snapshot stays690 |
| Expo statement | Opening1,000 − receipt400 = closing600, matching actual PDF; customer/invoice opt-outs and09:00→10:30 reminder settings persist |
| Consultancy accrual P&L | Revenue1,500 − costs300 = profit1,200 (April800, May400) |
| Consultancy cash P&L | Received revenue700 − paid costs300 = profit400 (April300, May100); GST excluded from income/cost |
| Balance sheet / cash / AR | Assets6,425 = liabilities225 + equity6,200; cash5,460; receivables920 |
| Real credit-invoice cash regression | Invoice1,000+GST150, receipt575 and expense230/GST30 gives cash revenue500 − expense200 = profit300. Previously revenue was incorrectly0 |
| Recurring and banking | Four unique documents, invoice115.02/GST15, Jan31→Feb28→Mar31; movements906.03; CSV adds12.10 once, then reviewed16NZD→10USD leaves source902.13/destination10.00 |
| Stripe simulator | Payment100 − platform fee4.30 = clearing95.70. Refund request leaves payment completed until verified webhook; confirmed full refund restores invoice100 and clearing0 |

Reports use posted journals. Cash recognition is a read-only source/settlement
allocation, retaining original identities and explicit warnings for unsupported
sources; it does not insert fictional replacement journals. Tests also cover
credit/refund/payment reversals, historical periods, FX carrying values and exact
cent conservation. The10,000-line/12-column fixture completed in well under its
10-second budget; it is local performance evidence, not a production load test.

## Defects found and fixed

- Actual invoice receipts were omitted from cash P&L; supplier settlements,
  credit/refund reversals, bank reclassification and FX now have source-backed
  cash recognition and independent expected results.
- Scheduled bank feeds and recurring jobs could reselect the creator's active
  company. Bound transaction use cases and current Identity permission checks
  now retain the owning company and fail closed after removal/demotion/archive.
- A delayed email acknowledgement could issue an edited invoice or resurrect a
  cancelled draft. Completion now compares the current snapshot and returns409
  after an intervening change, retaining the newer state and no new receivable.
- CSV import posted movements without updating displayed bank balances. Exact
  new-row movement updates now happen once in the same transaction; opposite
  directions are not treated as duplicate rows.
- Real ApplicationFee events do not contain payment_intent. Provider fee→charge
  →payment retrieval and independent fee-only reversals now handle that shape.
- Receipt scan gross/GST could be double-counted by mobile forms; modern proposals
  stay exact strings. Older installed clients retain the legacy numeric response
  unless they opt into exactAmounts.
- Unknown or unavailable providers no longer masquerade as successful capture.
  Failed scans retain the attachment and require explicit user save.
- Manual expense defaults used the UTC day; NZ/local business dates now respect
  server calendar settings without overwriting a user/scanned date.
- Customer action markup and the report's phone scrolling/clipping defect were
  reproduced and corrected. Report numeric right344 now fits content right350.

## Verification and screenshots

All browser flows use real local Hono/SQLite records. Provider acceptance tests
use explicit local HTTP/SDK fixtures; Stripe browser payments use its labelled
local simulator. Expo web is not installed iOS/Android.

- [Statements: desktop/phone, PDFs and immutable public snapshot](statements-web/)
- [Expo collections: five screenshots, PDF and persisted preferences](mobile-collections/)
- [Reports: desktop/phone/Expo, real PDFs/CSVs and source drill](reports/browser/)
- [Receipt inbox and actual Expo photo upload/private preview](receipts/)
- [Banking, CSV, FX and recurring screenshots](mobile-banking-recurring/browser/)
- [Stripe desktop/phone/Expo verification/refund screenshots](stripe/)
- [Honest provider-unavailable bank-feed screens](bankfeeds/web/)

Most web proofs use build `b6264eb0537c`. The only subsequent web production
change is the report-table responsive layout; final reports use build
`a00595275d99`. Final source maps were compared to the application sources.
The later API import/delivery fixes have their own real API and final mobile
banking verification. Expense-date changes affect mobile defaults; the earlier
receipt proofs explicitly selected their dates and amounts.

Final local gates (all exit0):

| Command | Node | Actual result |
| --- | --- | --- |
| `pnpm test:api` |24.22.1 |133 files /596 tests passed |
| `pnpm test:contracts` |24.22.1 |44 files /161 tests passed |
| `pnpm type-check:api` |24.22.1 |API/contracts clean |
| `pnpm test:run` |22.23.4 |165 files /866 tests passed |
| `pnpm type-check` |22.23.4 |App and Node projects clean |
| `pnpm lint` |22.23.4 |0 errors /120 warnings |
| `pnpm build` |22.23.4 |Verified0.0.8 /a00595275d99; all314 app source-map entries match |
| Mobile `npm test -- --ci --watchAll=false` |20.20.2 |143 suites /647 tests passed |
| Mobile types /lint /iOS export |20.20.2 |Exit0;0 errors /74 lint warnings; Hermes bundle exported |
| Exact CI readiness group /web sourcemap checker |22.23.4 |23+3 passed; parity report generation exit0 |
| SQLite migration verification |22.23.4 |Schema/decimal/tenant constraints passed |
| Pages compilation /Worker types /dry-run |22.23.4 |Exit0; no deployment |
| Actual Worker HTTP readiness and Identity/Ledger RPC flow |22.23.4 |5 passing entries; no provider call |

The four product suites total **2,270 passing tests**. Additional helper/HTTP
checks are counted separately. The full API output is retained as
[compressed raw output](checks/remaining-api-full-locked.log.gz), with its
[summary](checks/remaining-api-summary.log) and uncompressed SHA256. Other
summaries and logs are in [checks](checks/). Whitespace in text logs is
normalised; the compressed API output retains the original bytes.
 Initial failures are
not presented as passes: the first web run had846 passes/17 missing-provider
fixture failures, corrected without changing the existing assertions; the first
mobile run had642 passes/one incomplete report DTO fixture, corrected while
retaining its URL/period/basis assertions. Actual browser failures include signup
throttling (bounded11-second backoff, no limit bypass), icon/inactive-tab selectors,
controlled checkbox acknowledgement timing, CSV fixture newlines/filechooser,
and the real layout/import defects described above. Existing Jest teardown and
lint/build warnings remain reported; no forceExit or weakened CI gate was added.

[Independent initial review and builder resolution status](REVIEW.md). The
independent reviewer authored seven recurring reproducer tests and no production
implementation. Its final re-review was interrupted; the author does not issue
an approval or claim independent sign-off for later builder fixes. Human review
is required. Risk is **high**; auto-merge is not eligible.

## Work still open

| Area | Remaining |
| --- | --- |
| #105 live email/AI | Production secrets/provider configuration and actual inbox/model acceptance. Local tests do not establish live delivery or extraction quality |
| #108 Full App | Public multi-user OAuth/token lifecycle, verified webhook contract, approved consumer/privacy copy, native lock, accreditation and real provider acceptance. Personal App support is internal only |
| #87 payments | Payout/dispute/processing-fee posting and excess-capture allocation need reviewed account/liability/tax policy and implementation. Replaced-link lifecycle and QR polling acceptance also remain open. The Stripe report contains concrete accounting proposals and an explicit AC matrix |
| #30/native | Installed iOS/Android keyboard, document/camera providers, print/share sheets, offline/background/resume and store release acceptance |
| PR/release | GitHub API access and remote CI/human review, followed by owner-controlled deployment and live acceptance |
| #114 | Remains parked by explicit user choice |

Previously closed children #106/#107/#109/#60 are not reopened or claimed as new
work. The earlier GST slice remains separately documented. No issue is closed
merely because this local wave passes. Rollback requires a reviewed compatibility patch: retain additive migrations,
financial history, feed-source DTO support and any required revocation/webhook
handlers. A blind application revert can reject new feed rows. Disable new
provider operations before rollback; do not use destructive down migrations.
