# Fresh local feature verification — 8 November 2026

Base: `0a35c75` (fetched `jeevanvj/main`; dedicated verification branch was clean and exactly equal). No production deployment, real recipient mail, IRD submission or store release is performed.

The reusable [25 feature skills](../../../feature-verification.md) and [test mapping](../../../feature-verification.json) describe the expected business behavior and accounting invariants. A skill's existence is not a passing result. This run uses synthetic businesses and isolated local SQLite databases.

## Confirmed web month-close results

Real business actions use the Vite UI and Hono/SQLite. Read-back assertions compare the results with the pre-existing independent Decimal working paper, rather than deriving expectations from application output.

| Check | Expected | Actual |
| --- | --- | --- |
| Closing trial balance | Debit 13,680; credit 13,680 | Exact match |
| Balance sheet | Assets 12,480 = liabilities 980 + equity 11,500 | Exact match |
| Accrual profit | 1,500 | Exact match |
| Cash-recognition profit | 1,200 | Exact match |
| Cash | 11,380 | Exact match |
| Receivables / payables | 920 / 575 | Exact match |
| Reconciliation | Five existing sources, zero difference | Completed |
| Invoice-basis GST | 225 | Retained draft matches |

[Exact read-back and boundaries](web-month-close-results.json). [Actual PDF/CSV validation](export-validation.json) uses pypdf 7.0.0 to check the six downloaded PDFs and corresponding CSVs. This is a development-server run; the footer's committed version.json is not a claim of an immutable production build.

| Confirmation | Desktop | Phone-width web |
| --- | --- | --- |
| Closing TB 13,680 each side | [Screenshot](web-month-close/17-trial-balance.png) | [Screenshot](web-month-close/18-phone-trial-balance.png) |
| Profit 1,500 | [Screenshot](web-month-close/17-profit-loss.png) | [Screenshot](web-month-close/18-phone-profit-loss.png) |
| Cash 11,380 | [Screenshot](web-month-close/17-cash-flow.png) | [Screenshot](web-month-close/18-phone-cash-flow.png) |
| Completed reconciliation | [Screenshot](web-month-close/16-bank-reconciliation-completed.png) | Not captured in this case |
| GST preparation / retained draft 225 | [Screenshot](web-month-close/21-gst-worksheet.png) | [Screenshot](web-month-close/23-phone-gst.png) |

Operational screenshots and all actual exports are in [web-month-close](web-month-close/). Raw session cookies, synthetic passwords and database files remain in the gitignored local run directory, not this evidence folder.

## Statements and unavailable bank feeds

- Statements/reminders: real API-created synthetic source fixtures, then actual UI at 1440x900 and 390x844. Opening 230, closing 690, aging 460 + 230. Actual downloaded PDF confirms 690. Anonymous retained snapshot stays 690 after a later receipt changes the current statement to 575. Reminder settings persist after reload; opt-out is read back. [Log](statements-canonical.log), [screenshots and PDFs](statements-canonical/).
- Bank feeds: actual authenticated desktop/phone unavailable state, no connected accounts and no misleading refresh/public connection action. This proves the gate, not live Akahu connectivity. [Log](bank-feeds.log), [screenshots](bank-feeds/).

## Defects and retry history

[GitHub issue #162](https://github.com/jeevan-vj/ledger-craft-app/issues/162) records the verified Linux-only Chromium path and shared mobile run-state/output problem. The fix defaults to Playwright's installed browser, permits an explicit browser override, supports alternate loopback origins and isolates mobile output/session state. Four focused runtime regression checks pass; the fresh web walkthrough executes with the portable browser.

The receipt driver previously navigated away immediately after HTTP201 while the application still refreshed invoices/receipts. Its strict console check correctly failed on an aborted read. It now waits for the payment dialog to finish and for network idle. The original failure is retained in [browser-receipts.log](browser-receipts.log); receipt amounts and later report totals were nevertheless persisted correctly. A fresh focused desktop/phone regression is tracked separately.

The first cold invoice page timed out before loading; retry completed. The first statement run used 127.0.0.1 while APP_URL was localhost, so its canonical-share-origin assertion failed; rerunning with the configured localhost origin passed. These are recorded as tooling/configuration observations, not invented accounting defects.

## Verification summary and limits

[Machine-readable summary](verification-summary.json): latest complete-file results pass601 API assertions across135 files,874 web assertions across169 files,162 contract assertions across44 files, and4 proof-runtime regressions. [All25 API feature groups pass](api-feature-results.md). The initial API run had6 failed assertions and the initial web run7; every failed file was rerun in full with normal timeouts after the documented fixes. Original failures and reruns remain retained. This is combined current coverage, not a claim that either initial monolithic run was clean.

Web app/Node and API/contracts typechecks pass. Full lint has zero errors and120 warnings; final changed-file lint has zero errors and1 existing hook warning. Final production build (including version verification) and Expo web export pass. [Feature-by-feature UI ledger](ui-feature-ledger.json) records the confirmed scope without promoting route screenshots to complete business-flow acceptance. Some UI subflows remain unrun; native device, native share/camera, installed binaries, live providers, hosted CI and deployment are unclaimed. No production corrections or IRD submission. Issue #114 remains parked.

## Fresh Expo exported-build acceptance

All month-close phases passed against the exported Expo web bundle with an isolated SQLite company: signup, setup, invoices/payments, supplier bill/payment, paid expense, credits/refund, five-line bank reconciliation, reports, independent audit, actual exports and retained GST evidence. Chart-account creation is the explicit setup-only API exception; economic operations use the UI. [Independent audit](expo-month-close/audit.json), [actual reports](expo-month-close/actual-reports.json), [PDF/CSV validation](expo-month-close/export-validation.json), [screenshots](expo-month-close/). Every phase records page and console errors separately. This is Expo web, not installed iOS/Android QA.

[Quick sale](quick-sale/) additionally verifies persisted cart/favourites, cash charge, receipt QR, anonymous paid invoice, daily totals, an empty past day, offline guard and an idempotent retry after a lost response. [Run log](quick-sale-final.log). The buyer screen uses the same isolated Expo/API environment; the driver now accepts its buyer origin explicitly.

[Recurring and banking](expo-recurring-banking/) verifies invoice/bill schedules, NZ month-end previews, pause/resume, four unique generated documents, exact invoice115.02/GST15, persisted bank preference, movement pagination, statement continuation, mapped CSV duplicate review and reviewed FX transfer16NZD to10USD. Provider delivery remains unconfigured.

## Additional confirmed workflows and fixes

- [Payments](payments/): production-preview desktop/phone UI, reload balance57.50, exactly one receipt and one payment journal per action, no console/page errors. [Log](payment-settled.log).
- [Receipt imports](receipt-import/): three images plus PDF, resumed drafts, exact reviewed115/GST15, same retained attachment and duplicate override. AI-unavailable fallback is explicit. [Log](receipts-built.log).
- [Catalogue and quotes](catalogue-quotes/): actual create/edit/reload price125, quote115 marked sent/accepted and converted to a draft, with unchanged trial balance. [Final rebuilt log](catalogue-quotes-complete.log).
- [#164](https://github.com/jeevan-vj/ledger-craft-app/issues/164): acceptance tests no longer overwrite historical evidence; red/green regression retained.
- [#165](https://github.com/jeevan-vj/ledger-craft-app/issues/165): price labels now name their inputs; accessibility regression and actual create/edit persistence confirmed.
- [#166](https://github.com/jeevan-vj/ledger-craft-app/issues/166): Stripe refund fixture now dates its credit from its actual settlement, preserving the server chronology guard.
- [#167](https://github.com/jeevan-vj/ledger-craft-app/issues/167): quote conversion used to post a journal while the resulting invoice was still draft. The fresh UI check caught receivables+115, sales+100 and GST+15. Removed the redundant posting call. All seven quote API tests pass, including no journal after conversion/replays and exactly one after issue. The same browser flow now confirms unchanged books. Historical journals remain untouched and require separately reviewed correction if affected.

The bundle transformation passed; its version verifier was rerun successfully after restoring the generated metadata (early cleanup had caused the postbuild comparison to fail). [Verified identifier](web-build-fixed.json), [version verification](feature-build-version-fixed.log). Web typecheck passes. Lint exits0 with zero errors and120 warnings. These are local checks, not hosted CI or release approval.

[FX workflow](fx/) confirms reviewed AR/AP revaluation160→170, next-day reversal160, settlement165 and exact realized gain/loss5. [Expo statements](expo-statements/) confirms opening1000/payment400/closing600 with the actual PDF, secure snapshot, opt-outs and persisted reminder settings. Both use synthetic API fixtures and real UI actions; provider delivery is not claimed.

## Calendar cutoff defect

[#168](https://github.com/jeevan-vj/ledger-craft-app/issues/168): UTC noon shifted the chosen month-end into the next Auckland day. The page now preserves the local calendar cutoff. The regression failed before the fix; all8 page/adapter tests pass in both Auckland and UTC. [Actual rebuilt browser proof](dashboard-calendar/results.json) confirms28 daily October4–31 requests and six May–October monthly requests, all successful; [screenshots](dashboard-calendar/) show the selected period and reconciled figures. Final build identifier: [web-build-final.json](web-build-final.json).

All seven logged issues have local fixes and rerun evidence. They remain open because these changes have not been merged or deployed. Existing journals, historical acceptance artifacts and the tracked version file were preserved.

## Converted invoice cache defect

[#169](https://github.com/jeevan-vj/ledger-craft-app/issues/169) was caught during final screenshot inspection: the saved draft existed, but navigation reached a stale invoice list and showed “Invoice not found” until reload. Both conversion paths now refresh canonical invoice data before navigating. Both deferred-refresh regressions failed before the change and pass after it; the three invoice-detail quote-source tests also pass. The browser driver now requires the actual invoice number before a success screenshot. Original misleading captures are retained in [catalogue-quotes-before-cache-fix](catalogue-quotes-before-cache-fix/), not treated as successful display proof.

The final rebuilt catalogue/quote walkthrough passes with the converted invoice visibly rendered before reload, price125 retained, total115/draft status confirmed and trial balance unchanged. Final complete build: [web-build-complete.json](web-build-complete.json); [build log](feature-build-complete.log).

Final app and Node-project typechecks pass after correcting a test-only Testing Library option; [final log](web-typecheck-verified.log). Latest combined web coverage is874 passing assertions across169 files, including both quote-cache regressions. All test, screenshot and provider boundaries above still apply.

## PR integration baseline

Before PR creation, authoritative main advanced to `8f6bb6866c27a5fed5f9a1aa1caa728e16a94d4f` (self-service close controls, PR #170). This branch merges that commit and preserves both sets of documentation. The Stripe fixture uses the actual stored settlement date, avoiding a midnight boundary between settlement and credit creation. Existing screenshots and aggregate counts above remain evidence for their recorded pre-merge source; combined-head checks are recorded separately. Journals, banking and reports skills now include account setup, period locks and accountant ZIP acceptance. The upstream UI evidence remains separately attributed, not claimed as a fresh run here.
