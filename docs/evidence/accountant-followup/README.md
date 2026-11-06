# Independent accountant follow-up — 6 November 2026

This is a new synthetic-business run after `d71e377`, with expected figures fixed
before comparison. Tests use real Hono and temporary SQLite, not mocked journals.
The business working paper passes; the full final verification table is below.

## Independent working paper

Opening capital is 10,000. Standard-rated sales are 2,000+GST300, with 1,150
received. A separate eligible zero-rated sale is 500 and unpaid. A supplier bill
is 1,000+GST150 with 575 paid. An approved expense is 200+GST30. A credit note
of 200+GST30 reduces the unpaid portion of the first invoice.

| Check | Independent expectation | Actual |
| --- | ---: | ---: |
| Revenue |2,000+500−200 =2,300.00 |2,300.00 |
| Costs / profit |1,200.00 /1,100.00 |1,200.00 /1,100.00 |
| Cash |10,000+1,150−575−230 =10,345.00 |10,345.00 |
| Receivables |2,300−1,150−230+500 =1,420.00 |1,420.00 |
| Payables |1,150−575 =575.00 |575.00 |
| Invoice-basis GST |270−180 =90.00 |90.00 |
| Payments-basis GST |150−105 =45.00 |45.00 |
| Balance sheet |Assets11,945 = liabilities845 + equity11,100 |Balanced |

November settlements, receipt reversal and credit reversal preserve every
October report section and GST snapshot. All 13 resulting journals balance
individually; the eight original journals and their lines remain unchanged.
[Raw expected/actual working paper](month-close.json).

## Issues reproduced and fixed

- Metadata-only bank fees/book corrections could manufacture reconciliation
  readiness without a ledger posting. Those writes now return422, explaining
  that an actual transaction or posted journal is required. Legacy unsupported,
  malformed or reversed declarations do not change balances; review warnings
  remain visible on web and Expo. Raw historical rows remain available.
- Signed bank errors previously changed the book side. Only valid bank-side
  timing declarations and bank errors now adjust the statement; books remain
  the posted ledger. The existing cent regression incorrectly assumed an
  unposted book correction. It now verifies the genuine bank-error case:
  statement0.14+deposit0.01−check0.02−bank error0.03 = book0.10.
- Completed statements accepted later adjustments, backdated bank postings,
  draft-to-posted manual journals and changes to their bank/chart financial
  identity. The shared cutoff now blocks those changes, including dates before
  the statement start that would alter its cumulative closing balance. Invalid
  calendar dates cannot bypass the comparison. Names can still be changed;
  deleting a bank cannot cascade away its completed-statement audit.
- Three-line journals hid the GST line by returning only the first debit and
  credit. The API now provides all lines and exact debit/credit totals while
  preserving legacy fields. Web journal detail, tables and CSV use the complete
  journal. The old Export action only displayed success; it now downloads actual
  CSV rows through the existing spreadsheet-safe encoder.

Tests first reproduced each bug before its production fix. The close controls
cover ten regressions; two additional tests cover canonical statement handling.
[Complete journal expected/actual evidence](multi-line-journal.json).

## Browser evidence

- [Expo web at390×844](mobile/README.md): legacy fee warning, book0 versus
  statement−10, difference−10; UI sends no completion request, and the backend
  independently rejects completion400. These are explicitly seeded historical
  rows in an isolated test database, not responses fabricated by the browser.
- [Web at1440×900 and390×844](web/README.md): signed bank error−0.04 adjusts
  statement0.14 to posted books0.10, difference0, followed by actual UI
  completion0.10. A three-line purchase journal retains expense1,000, GST150 and
  payable1,150 in its detail and downloaded CSV. Eight screenshots and two CSVs
  are saved, with no browser page errors.

## Final verification

| Command | Runtime | Result |
| --- | --- | --- |
| `pnpm test:api` |Node24.22.1 |101 suites /467 tests passed, exit0; no skipped tests |
| `pnpm test:contracts` |Node24.22.1 |35 suites /141 tests passed, exit0 |
| `pnpm type-check:api` |Node24.22.1 |API and contracts TypeScript exit0 |
| `pnpm lint` |Node22.23.4 |0 errors /119 warnings, exit0 |
| `pnpm type-check` |Node22.23.4 |App and Node configurations exit0 |
| `pnpm test:run` |Node22.23.4 |146 suites /793 tests passed, exit0 |
| `pnpm build` |Node22.23.4 |Exit0; postbuild verifies0.0.8 /62ec9ab8d0fe |
| Exact CI readiness checker group |Node22.23.4 |23 tests passed, exit0 |
| Web sourcemap checker / parity report |Node22.23.4 |1 test passed /report exit0; report generation is not full feature parity |
| Mobile Jest |Node20.20.2 |115 suites /551 tests passed, exit0 |
| Mobile TypeScript / lint |Node20.20.2 |0 errors; lint74 warnings, exit0 |
| `expo export --platform ios` |Node20.20.2 |Exit0; `/tmp/ledgercraft-accountant-followup-ios` |
| Worker compile `wrangler deploy --dry-run` |Node24.22.1 |Exit0; no deployment |

The existing Jest worker-teardown warning remains; no `--forceExit` was used.
An independent reviewer checks the production delta and captured regression
evidence separately: [review](REVIEW.md).

The final build's296 embedded local source files exactly match the current web
implementation. Both browser result JSON files contain empty page-error lists.
Base is current main7ebbab0 (PR158 already merged), whose tree equalsd71e377;
the follow-up is isolated on `codex/accountant-close-followup`.

## Boundaries

These are completed **bank-statement** cutoffs, not an organisation-wide fiscal
period lock or a legal tax certification. Zero-rating eligibility is an explicit
synthetic-case assumption. No production books were changed, and no real email,
IRD filing, deployment or native-device test is claimed. Native iOS/Android QA,
live inbox delivery and tax-policy/filing acceptance remain unverified. The
earlier [accounting-completion report](../accounting-completion/README.md) records
the broader flow and its separate full-IR4, foreign-bank and mixed-tax limits.
