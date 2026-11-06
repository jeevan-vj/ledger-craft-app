# Web accountant follow-up

Actual Chromium browser workflow against local Hono/SQLite and production preview
build `62ec9ab8d0fe`. Every run uses a new synthetic company and a stable viewport:
desktop1440×900 or phone390×844. This is web evidence, not native-device evidence.

| Operation | Independent expectation | Actual |
| --- | --- | --- |
| Posted bank interest and statement mismatch | Actual posted bank0.10, statement0.14, difference0.04; completion unavailable |0.10 /0.14 /0.04, not ready |
| Reviewed bank error | Signed−0.04 belongs on bank statement side; book balance stays0.10 | Exact request string−0.04, affectsBanktrue/affectsBookfalse; bank0.10/book0.10/difference0.00 |
| Complete statement | Completed bank closing0.10 with no invented expense/journal | Completed0.10, difference0.00 |
| GST purchase journal | Cost debit1,000 + inputGSTdebit150 = APcredit1,150; all three lines visible | Three lines, server debitTotal1,150 and creditTotal1,150; GST150 visible in detail |
| Journal export | Actual CSV has all three journal lines, including GST150 | Downloaded CSV: header+three postings; exact server amount strings |

Both viewport cases pass; results.json records no page errors. There are eight
screenshots and two downloaded CSV files. Original response bodies and exact
request fields are in [results.json](results.json). The script is
`scripts/accountant-reconciliation-web-proof.mjs`; its output is [browser.log](browser.log).

Reconciliation form tests also verify that unsupported bank-fee, interest and
book-error metadata options are absent, and explain the actual posting workflow.
Historical warning presentation is verified through component and adapter tests;
this browser fixture has no historical unposted adjustment to display.

Commands under Node22:

- `pnpm exec vitest run src/features/journals/api/journalsApi.test.ts src/pages/__tests__/JournalEntriesPage.test.tsx src/components/reconciliation/AdjustmentDialog.test.tsx src/components/reconciliation/ReconciliationReport.test.tsx src/services/__tests__/reconciliationService.summary.test.ts`: five suites/eight tests passed.
- `pnpm exec tsc --noEmit -p tsconfig.app.json --pretty false`: exit0.
- Scoped ESLint: zero errors, one pre-existing JournalEntriesPage hook dependency warning.

Red regressions were recorded before production edits in
`/tmp/accountant-web-red.log` and `/tmp/accountant-web-journals-red.log`. The
first browser fixture omitted its required expense account; the fixture was
corrected to create it, preserving all independent amount assertions.
