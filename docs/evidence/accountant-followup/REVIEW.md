# Independent accountant follow-up review

Reviewed by a separate reviewer session which did not write the implementation
or regression tests. Scope: the follow-up working-tree changes against
`7ebbab0` (`origin/main`, tree-equivalent to the original `d71e377` review base),
including new source files. This is a local code review, not approval of a
published PR or a recommendation to merge.

## Current verdict

**PASS — local follow-up review.**

Blockers: none identified in the reviewed production changes or final recorded
local verification. This verdict covers the reviewed working-tree delta; it is
not a recommendation to merge a remote PR whose head and checks were not read.

Should-fixes: none identified. Nits: none.

## Checks performed

- Company identity comes from the authenticated organisation context. New
  statement/account queries retain organisation predicates.
- Completed or locked bank statements reject backdated cash postings, including
  dates before the statement start. Common postings, supplier postings, and
  manual draft-to-posted transitions use the cutoff check. Canonical calendar
  dates are required, and idempotent existing-posting replay remains before the
  guard.
- Bank opening/current balances, currency, account deletion and the linked
  chart account's financial identity cannot invalidate completed statements.
  Display-name corrections remain possible.
- Statement adjustments do not manufacture book entries. Supported timing
  declarations and signed bank errors affect the statement side only. Reversed
  or malformed historical declarations and unposted book adjustments do not
  enter the arithmetic; warnings preserve their review visibility.
- Reconciliation arithmetic and journal totals use the existing exact decimal
  helpers. No migration or stored journal is rewritten.
- Full journal lines and separate debit/credit totals survive the public DTO
  and web adapter. The web view and actual CSV export include the GST line
  instead of presenting only two accounts. CSV cells use the shared escape and
  formula-neutralisation helper.
- Web/mobile warnings are displayed. Mobile refreshes the summary and requires
  another review when balances or warnings change before completion.
- Regression assertions cover actual amounts and states with real Hono/SQLite
  for ledger behaviour. The older cent-adjustment test was corrected because
  it had encoded an unposted book correction as real cash; its replacement
  reconciles a supported bank error without changing the posted book balance.

## Verification evidence

An independent targeted run was started with Node 24:

```sh
pnpm --filter @ledgercraft/api exec vitest run \
  src/modules/accounting/accountant-close-controls.test.ts \
  src/modules/reconciliation/statement-adjustments.test.ts \
  src/modules/journals/multi-line-journals.test.ts
```

Result: **exit 0; 3 suites / 13 tests passed**, no skipped tests. Local log:
`/tmp/accountant-independent-review-tests.log` (Node 24.22.1).

Final combined results are maintained in the accompanying follow-up report.
Final recorded gates are: API101 suites/467 tests, no skips (exit0,
`/tmp/accountant-followup-api-tests.log`); web146 suites/793 tests; contracts35
suites/141 tests; mobile115 suites/551 tests; strict web/API/contracts/mobile
types clean; lint0 errors (web119/mobile74 warnings); web build62ec9ab8d0fe;
mobile iOS export; release checker23+1 tests and Worker compilation passed.
All final local gates passed. No claim is made about remote GitHub CI.

I checked both browser result JSON files (`errors: []`) and visually inspected
the phone journal and mobile warning screenshots. The journal shows debit1,000
cost plus150 GST against credit1,150 payable, with equal totals. The synthetic
legacy-fee mobile fixture shows posted books0, statement−10, difference−10 and
the review warning, without claiming readiness or native-device execution.

The reviewed production source snapshot is recorded locally in
`/tmp/accountant-review-source-hashes.json`; any later implementation changes
need a delta review. Its24 production-file hashes were checked again after the
full API run and were unchanged.

## Risk and limits

Risk: **high**, because these changes affect bank reconciliation and ledger
posting controls. Auto-merge: **not eligible**. Human review and merge remain
required; no labels, approval, merge, deployment or external review comment was
issued by this reviewer.

These are completed **bank-statement** cutoffs, not an organisation-wide
accounting/GST period-lock calendar. The independent working paper validates
specific expected business transactions and subsequent-period reporting; it
does not establish current-law tax certification or production-data correctness.
Actual native-device, real inbox delivery and IRD acceptance checks remain
outside the available evidence.
