# November and financial-year rollover API verification

Real authenticated Hono HTTP and disposable SQLite; no mocked repositories or direct transaction fixture writes. All chart, source, posting, receipt, credit, import, bank-match, GST draft and cutoff operations use actual API routes. The independent [working paper](../expected.json) was frozen before report assertions. This is API acceptance, not UI or installed-device acceptance.

## Result

The numeric accounting results passed on the merged main. Accountant review subsequently found a presentation gap: the equity total included accumulated earnings, but the displayed/exported account rows did not disclose that earnings bridge. Existing behavior correctly carries the nine October closing role balances into November, preserves old as-of reports after later settlements, and carries cumulative earnings through the NZ March31 year end while April P&L uses only April activity. Fiscal close does not post a synthetic closing journal or zero the stored nominal accounts; that is deliberate and matches the working paper.

- November closing TB14,370 per side, period turnover8,970 per side including retained import/match legs; opening sides equal October13,680 per side.
- November assets12,670 = liabilities770 + equity11,900; period profit400, cash11,955, AR460/AP230, invoice-basis GST60. Cash P&L500 matches the settled October/November source components.
- October's entire report, original journal records and GST fingerprint remain unchanged after November settlements. November reports and March31 reports remain unchanged after April sources are posted.
- March31 fiscal profit1,900 and equity11,900; old November AR460/AP230 are over90days.
- April opening sides equal March closing sides. Closing TB14,715, assets12,915 = liabilities915 + equity12,000; period profit100, cash12,185, GST15. Equity includes capital10,000 plus prior-financial-year earnings1,900 plus current-year earnings100. The present API exposes correctly accumulated equity, not a separate posted retained-earnings transfer.
- Prior-financial-year comparison passes on both accrual and cash basis. Calendar-quarter and all seven monthly P&L columns match the paper. April cash P&L200 excludes the unpaid April bill.
- Saved November GST draft is unchanged after later activity and fiscal close. A payments-basis request against saved invoice-basis registration is correctly rejected422 `GST_BASIS_MISMATCH`; the alternative analytical figures in the paper are not claimed as registered-basis UI acceptance.
- Closing reviewed November rejects a backdated nonbank expense/equity journal409 `ACCOUNTING_PERIOD_CLOSED`. March close creates no journal and preserves all existing journal records.

Overpayments are **rejected**, not silently recorded as customer credit: attempting1,150.01 against the1,150 invoice returns400 `PAYMENT_EXCEEDS_BALANCE`, with the complete payment and journal lists unchanged. A subsequent575 receipt with the same HTTP idempotency key/body returns the original receipt and creates no second journal; a changed retry body returns409 `IDEMPOTENCY_CONFLICT`. This verifies the supported boundary without inventing an unapproved overpayment wallet feature.

## Reproduction and evidence

[Actual reports, drafts and HTTP command/status trace](results.json), [targeted run](targeted-green.log), [types](types-green.log), [command/exit metadata](verification.json).

Node24.22.1: targeted4files/9tests **exit0**, including the new end-to-end scenario plus historical-aging, paid cash-recognition and column regressions. API/contracts TypeScript **exit0**. Source files: `second-month-year-end.e2e.test.ts` and `second-month.test-helper.ts`; the existing full-month helper only adds an optional idempotency-key argument, leaving its default behavior unchanged.

The test uses a **Date-only controlled clock of May1,2027** to model completed November/March accounting periods. It does not weaken or bypass the production future-close validation; async timers, authentication, HTTP handlers and SQLite remain real. These are synthetic dated business events, not a live filing or production mutation.

Initial test-development attempts used unsupported journal-list query parameters and invalid GST-draft fields; those fixture assumptions were corrected to documented API contracts before acceptance. They were not production defects and no red/green production fix is claimed. The subsequent disclosure fix described below changes only the optional report DTO, the canonical engine output and shared export rows; no money calculation, source posting or database schema changes.


## Canonical earnings bridge follow-up

Real failing tests first demonstrated that report parsing stripped `balanceSheet.accumulatedEarnings`, the API omitted November earnings1,900, and shared export rows omitted the bridge. The fix exposes the engine's **already computed cumulativeIncome** as optional exact decimal text `balanceSheet.accumulatedEarnings`. It does not recalculate, add earnings to equity a second time, split fiscal years or post a closing journal. Accrual values reconcile November1,900, March1,900, April2,000.

`financialReportRows` now copies the optional field into an **Accumulated earnings (included in equity)** row. That shared model drives CSV, web PDF, Expo web PDF, native HTML/PDF and the accountant ZIP. Older server reports remain accepted and omit the bridge when the optional field is absent. Tests cover negative earnings, number rejection, exact decimal text beyond JavaScript safe-integer range and absence on a legacy report.

TDD: [contract/export red](earnings-contract-red.log)2 failures; [real API red](earnings-api-red.log)1 failure. Green: [contracts](earnings-contract-green.log)3files/6tests, [API/report/archive regressions](earnings-api-green.log)4files/10tests, [API/contracts types](earnings-types.log), all exit0 under Node24.22.1. UI screenshot verification is owned by the web/mobile walkthroughs. Existing raw ledger balances and all reported totals remain unchanged; only the explicitly disclosed server field/row is added.
