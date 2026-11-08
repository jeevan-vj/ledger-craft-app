# Mobile test-first fixes

Each failure was observed before the corresponding production edit. Every red run exited 1; each listed green run exited 0. Commands used Node 20.20.2, `npm --prefix mobile test -- --runInBand --watchAll=false <test path>`.

| Behaviour | Test | Red | Green |
| --- | --- | --- | --- |
| Expo web can select a real historical date, respects minimum dates, rejects 30 February | `src/components/ui/SmartDatePicker.test.tsx` | 2 failures: custom date field absent | 2 passed |
| Closing trial-balance totals differ explicitly from period turnover | `src/screens/reports/ReportsScreen.test.tsx` | 1 failed, 9 passed: Period debits absent | 10 passed |
| A posted customer refund is available as an existing bank settlement | `src/components/banking/ExistingSettlementPanel.test.tsx` | 1 failed, 2 passed: refund candidate absent | 3 passed |
| Equal customer receipts identify their own date and reference | Same settlement test | 1 failed, 3 passed: identified candidate absent | 4 passed |
| Explicitly enabling GST on a pending untaxed expense applies the NZ default rather than the inferred zero rate | `src/screens/expenses/ExpenseEditScreen.test.tsx` | 1 failed, 2 passed: submitted 200 gross / 0 GST instead of 230 / 30 | 3 passed |
| Browser home-task dismissal uses local storage while native retains SecureStore | `src/screens/main/homeTaskStorage.test.ts` | 1 failed, 1 passed: browser dismissal not retained | 2 passed |
| Eight-column trial-balance PDF uses landscape on native and Expo web | `src/features/reports/model/financialReportShare.test.ts` and `.web.test.ts` | Native 1 failed/3 passed; web 1 failed: portrait instead of landscape | Native 4 passed; web 1 passed |
| The import screen does not render an empty error string as a raw View child | `src/screens/banking/BankStatementImportScreen.test.tsx` | 1 failed, 1 passed: direct child array contained `""`; actual browser logged Unexpected text node | 2 passed |

The browser already had separate `.web.ts` financial and GST export implementations. They remain in use; no replacement export system or new dependency was added. Actual files are downloaded by the final UI walkthrough. Native PDF generation and share-sheet invocation remain covered by module tests; installed-device acceptance is pending.
