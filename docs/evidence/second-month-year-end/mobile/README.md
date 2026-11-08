# Mobile second-month close and year-end rollover

Verified locally on 8 November2026 through the actual Expo web UI in Chromium390×844, dark theme, Pacific/Auckland. Synthetic company **Kauri Second Month Mobile Limited**. The local API calendar is simulated at May1,2027 so November30/March31 closing guards can be exercised without weakening production validation. The browser shifts Date only and lets it advance; real timers, performance and pointer timestamps remain intact for native gesture/animation behavior.

All economic operations, chart setup, statement imports/matches, GST drafts and period closes use actual UI. Authenticated API GETs independently inspect records; no API fixture writes substitute for business operations. [Metadata](metadata.json) records all27phases, source hashes, bundle hashes and zero unexpected page/console errors. Exact onboarding401/404 and the deliberately rejected closed-date409 are retained separately in phase records. Existing React Native Web deprecation warnings remain visible.

## Independent expectations versus actual

| Control | November30 | March31 year end | April30 new year |
| --- | --- | --- | --- |
| Closing trial balance, each side | 14,370 | 14,370 | 14,715 |
| Assets | 12,670 | 12,670 | 12,915 |
| Liabilities / equity | 770 /11,900 | 770 /11,900 | 915 /12,000 |
| Period accrual profit | 400 | 1,900 for the financial year | 100 |
| Accumulated earnings, included in equity | 1,900 | 1,900 | 2,000 |
| Closing bank cash | 11,955 | 11,955 | 12,185 |
| Receivables / payables | 460 /230, current | 460 /230, over90days | 460over90 /345 (230over90+115current) |
| Invoice-basis GST | 60 | December–March four nil drafts | April15 |
| Statement matches / difference | 5 /0.00 | 0 /0.00 for inactive Dec–Mar | 1 /0.00 |

Every figure above matches the independently frozen [paper](../expected.json), [cash/bank supplement](../supplemental-paper.json) and [nil-return paper](../nil-gst-paper.json). All nine opening and closing ledger roles are checked against the paper. April’s raw GL is independently summed in integer cents. November cash-basis profit is500; April cash-basis profit is200 (the April bill is unpaid). Financial-year/quarter comparisons show prior-year profit1,900 and new-year profit100. P&L dates reset at April1 while cumulative earnings remain in equity; the app does not post an artificial closing journal or reset ledger history.

The first-year fiscal cash-flow query includes a10,000 initial bank/capital ledger entry dated September30. It is not evidence of a real in-year capital receipt or complete April–September trading history. Literal fiscal ledger cash inflows13,795 less outflows1,840 =11,955 reconcile. For the prescribed October–March operating history, opening10,000 + receipts3,795 − payments/refund1,840 =11,955. See the supplement for the scope qualification.

## Screenshots

| Step | Actual screenshot |
| --- | --- |
| Collect October receivable and settle old supplier bill | [Receipt](36-october-receivable-collected.png), [Bill paid](37-october-bill-settled.png) |
| Prevent overpayment, then record valid partial receipt | [Blocked1150.01](38a-overpayment-prevented.png), [575receipt](38-november-part-receipt.png) |
| New credit / partly paid bill / paid expense | [Credit](39-november-credit.png), [Bill](40-november-half-paid-bill.png), [Expense](41-november-paid-expense.png) |
| November bank close | [Zero difference](42-november-bank-zero-difference.png), [Completed](43-november-bank-completed.png) |
| November reports | [P&L](november/profit-loss.png), [Balance sheet bridge](november/accumulated-earnings-bridge.png), [TB](november/trial-balance.png), [Cash flow](november/cash-flow.png), [AR](november/receivables.png), [AP](november/payables.png) |
| November GST and close pack | [GST60](november/gst-prepared.png), [Pack](november/accountant-pack.png), [Period close](november-close-closed.png) |
| No-activity December–March bank close | [Zero difference](48-year-end-no-activity-bank-review.png), [Completed](49-year-end-bank-completed.png) |
| Four separate nil GST drafts | [December](nil-gst-2026-12-01.png), [January](nil-gst-2027-01-01.png), [February](nil-gst-2027-02-01.png), [March](nil-gst-2027-03-01.png) |
| March year-end reports and cutoff | [P&L](year-end/profit-loss.png), [Balance sheet bridge](year-end/accumulated-earnings-bridge.png), [TB](year-end/trial-balance.png), [Cash flow](year-end/cash-flow.png), [AR](year-end/receivables.png), [AP](year-end/payables.png), [Close](year-end-closed.png), [Pack](year-end/accountant-pack.png) |
| First new-year receipt, bill and bank close | [Receipt](44-april-new-year-receipt.png), [Bill](45-april-unpaid-bill.png), [Completed bank](50-april-bank-completed.png) |
| April reports | [P&L](april/profit-loss.png), [Cash P&L](april/cash-profit-loss.png), [Balance sheet bridge](april/accumulated-earnings-bridge.png), [TB](april/trial-balance.png), [Cash flow](april/cash-flow.png), [AR](april/receivables.png), [AP](april/payables.png) |
| April GST and working pack | [GST15](april/gst-prepared.png), [Pack](april/accountant-pack.png) |
| Financial-year comparison | [Prior year](46-fiscal-year-comparison.png), [New year reset](47-new-year-reset-and-comparison.png) |

## Evidence and changes

[Final audit](final-audit.json) verifies October’s preexisting seven financial sections, GL lines and saved GST record remain unchanged after November collections and later operations. November reports likewise remain unchanged after April activity. The newly added optional `balanceSheet.accumulatedEarnings` is checked separately: October1,500, November/March1,900 and April2,000. All previously present fields compare strictly. [Earnings proof](earnings-bridge-verification.json) records the final-source read-only refresh; no journals changed.

The accountant review found a presentation gap: equity included cumulative earnings, but the balance-sheet rows did not expose that bridge. The mobile readout now displays the canonical server field as **“Accumulated earnings (included in equity)”**. It does not recompute profit or add the amount twice. Tests first failed for the missing positive/negative readout, then passed, with backward compatibility when the field is absent. All14reports component tests pass; red/green logs are retained in [checks](checks/).

After the API/UI fix, all six financial PDFs and CSVs plus ZIPs were downloaded again for November, March and April on the same unchanged books. [Artifact verification](artifact-verification.json) independently opens all three final archives (14members and all13member hashes each), checks canonical figures, and extracts/checks all18PDFs and18CSVs including the earnings row. The final read-only April cash-basis UI proof separately checks200revenue, zero settled costs and200profit in [cash report](april/cash-report.json). The earlier October baseline retains seven PDF exports and its verified14member ZIP; it was captured before the additive readout.

Four completed contiguous statement periods cover October, November, December–March and April with5/5/0/1matches and zero differences. No December–March ledger lines or synthetic closing journals appear. Four nil GST records are separate retained **drafts**, prepared before the March cutoff. April15 is also saved as a draft. No return is filed in myIR. April remains a working accounting period after the March fiscal cutoff; archive warnings are retained rather than claiming it is closed or filed. Annual-pack warnings also preserve incomplete pre-opening history and absence of a matching annual filed GST return; the registered filing periods are monthly.

Early verification-harness revisions froze Date or replaced timer clocks, which could stop native-web animation/tap completion. The final Date-only advancing offset resolves that test setup issue. A GST-settings readback caught that the early tap had not persisted basis/frequency; an explicit UI save and response/readback verified Invoice/monthly before any fiscal cutoff. Accepted source IDs were read back before resuming to prevent duplicate operations. These are disclosed harness corrections, not production financial fixes.

## Checks and platform limit

Node20.20.2: `npm ci`, lint, TypeScript, full Jest and iOS/Android exports all exit0. **150suites /677tests pass; lint0errors /74warnings; types0errors.** The full Jest command reports the same worker-teardown warning present in the prior merged run and still exits0; logs retain it. npm reports existing engine/deprecation warnings. [Commands and logs](checks/commands.json) are preserved.

Installed Android/iOS QA is unavailable: no adb/emulator, xcrun/Xcode or `/dev/kvm` exists in this environment. Both native Hermes bundles pass, but Expo web screenshots do not verify installed-native share sheets, cancellation, app lifecycle, keyboard or date pickers. Those remain named device checks before native release. No native module/runtimeVersion change, production deploy, real provider send or IRD submission occurred.

Reproduction driver: [second-month-mobile-close-proof.mjs](../../../../scripts/second-month-mobile-close-proof.mjs). Use the isolated synthetic API/Expo services and the documented test calendar; private session/record files stay under `/tmp/second-month-mobile-*` and are not tracked. Execute metadata’s phase order; `earnings-refresh` and `final-audit` are read-only and can be repeated after a presentation-only API/UI change.
