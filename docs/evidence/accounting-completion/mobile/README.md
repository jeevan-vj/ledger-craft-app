# Final mobile accounting verification

Actual platform: Expo web in Chromium, 390×844 and compact320×740.
Mobile FX uses the reviewed1.65 rate (book160 →165, difference5); the separate
web FX case uses1.70 (160 →170, difference10).
The Node20.20.2 commands below all exit0. This is local verification of the
working-tree implementation, not a signed-device or production-filing result.

| Command | Observed result |
| --- | --- |
| `npm test -- --ci --watchAll=false --maxWorkers=2` | 115 suites / 549 tests passed, no `--forceExit`; an existing worker teardown warning remains |
| `npm run type-check` | Strict TypeScript clean |
| `npm run lint` | 0 errors / 74 warnings |
| `EXPO_NO_TELEMETRY=1 SENTRY_DISABLE_AUTO_UPLOAD=true npx expo export --platform all --max-workers 2 --output-dir /tmp/ledgercraft-accounting-statement-final-export` | iOS, Android and web bundles exported |
| Node22.23.4 root `pnpm exec eslint mobile` | 0 errors / 15 warnings under root rules |
| `node scripts/accounting-completion-mobile-proof.mjs` | Passed, zero page errors |
| `node scripts/accounting-mobile-credit-fx-proof.mjs` | Passed, zero page errors |

The primary script signs up and enters the company, invoices, receipts,
expenses, vendor, bill and its partial payment through actual UI. Supporting
chart-account creation and bank-row import use the real HTTP API. It then
exercises GST/company-tax preparation, opening capital and supplier matching
through UI. The credit/FX script signs up and sets
up the company through UI, creates supporting source documents/rates through
the real API, and uses actual UI for credit/refund/reversal, settlements and
valuation. No response or ledger values are mocked in either browser proof.

Raw local command output is retained at:

- `/tmp/mobile-statement-final-ci-tests.log`
- `/tmp/mobile-statement-final-ci-tsc.log`
- `/tmp/mobile-statement-final-ci-lint.log`
- `/tmp/mobile-statement-final-root-eslint.log`
- `/tmp/mobile-statement-final-export.log`
- `/tmp/mobile-accounting-statement-browser.log`
- `/tmp/mobile-accounting-final-credit-fx.log`

## Independently expected and observed

Every assertion below passed against real API reports or mutation responses.

| Operation | Expected = observed |
| --- | --- |
| Base operating company | Profit850; cash1,031; AR230; AP276; invoiceGST135; balanced trial balance |
| Payments-basis GST | Output180 / input39 / payable141 |
| Reviewed GST-only adjustments output−15 and input+3 | Output195 / input78 / payable117; reviewed reasons/references survive reload |
| Company income-tax worksheet | Profit850 +addback100 −deduction50 −loss200 =taxable700; confirmed28% =196; credits50; payable146; saved worksheet reloads |
| Opening owner capital | Cash6,031; equity increases5,000; profit850/GST135 unchanged |
| Existing supplier69 match | Original partial payment retained; AP276, cash6,031, profit850, GST135 after duplicate import correction |
| Review and complete the supplier bank statement | Live posted book−69 / adjusted statement−69 / difference0 despite initially null session book metadata; completed status; cash6,031, profit850, GST135 and AP276 unchanged |
| Unpaid invoice1,150 credited230 | AR920; revenue/profit800; GST120; receipts0 |
| Paid invoice1,150 credited230 | Original receipts1,150 unchanged; customer credit230 |
| Refund customer credit230 | Cash920; profit800; GST120; refundable balance0 |
| Reverse refund and credit | Cash1,150; profit1,000; GST150; original receipts1,150 unchanged |
| Fully credit unpaid1,150 | Balance0 / credited1,150 / receipts0; displayed `Credited`, not cash-only `Paid` |
| USD100 invoice at1.60 settled at1.65 | Source amount100; book160; NZD cash165; exchange gain5 |
| USD100 bill at1.60 settled at1.65 | Source amount100; book160; NZD cash165 out; exchange loss5 |
| Revalue outstanding USD100 invoice and bill to1.65 | Unrealized gain5 / loss5; AR165 / AP165; cash1,150 and profit1,000 unchanged; balanced trial balance |
| Scheduled following-day reversal | AR160 / AP160 restored |

## Lost responses and session recovery

The browser deliberately lets the server commit and then aborts delivery of the
201 response. It reloads the app, resumes the saved request and asserts the
exact original body and Idempotency-Key are reused:

- Invoice receipt1,150: exactly one payment, including recovery when the invoice
  already displays paid and its ordinary payment action is hidden.
- Supplier partial payment69: exactly one payment after reopening.
- Credit issue230: exactly one credit note after reopening.
- Customer refund230: exactly one refund after reopening, even though the
  server now displays zero available to refund.

Durable pending bodies/keys use SecureStore on native and localStorage on web,
scoped by actor plus globally unique document identity; manual journals also
include the active organisation. Loaded attempts are treated as uncertain
before retry. A later401/422 or idempotency conflict cannot discard an earlier
uncertain request. No pending operation auto-sends in the background.

The final statement-completion delta consumes the shared authoritative summary
endpoint used by the web client. The preview reads−69 from the ledger rather
than treating nullable session metadata as zero. RNTL also rejects summary
load failure and a balance change between review and completion. Screens23/24
show the live summary and completed statement; the actual completed session and
unchanged report are in `results.json`.

A separate deliberate `/api/me` network failure shows `Retry session check`.
Retry resumes the original signed-in company without entering credentials
again. Confirmed401 still returns to the signed-out flow.

Manual-journal entry/retry/remount and historical corrective-journal apply are
verified by real SQLite/API tests plus RNTL, not by these browser proofs. The
browser opening-capital journal is a separate verified path. No production
ledger audit/apply was run.

RNTL additionally checks exact source snapshots on saved-GST reload, company
worksheet reload, receipt confirmation before historical corrections,
unallocated posted AR warnings, multi-account opening balances, manual-journal
retry/remount, actor isolation, loading/empty/errors, stale valuation review,
valid dated FX rate filtering, and native persistence failure before dispatch.

## Evidence and boundaries

- [Primary results](results.json), 27 numbered screenshots in this directory.
- [Credit/FX results](../mobile-credit-fx/results.json), 14 numbered screenshots
  in the sibling directory. Files00/01/02/03 include real signup/session-retry
  captures as well as credit workflow captures.
- [Native readiness](native-readiness.txt): actual device checks are blocked.
  Linux has no adb/Android SDK/emulator/KVM or Xcode/iOS tools. The executable
  `mobile/scripts/verify-device-accounting.sh` returns exit2 and records this
  limitation. `mobile/docs/accounting-device-qa.md` lists exact device cases.

No real company data was corrected, no actual invoice email was sent, no IRD
return was submitted, and no signed native build was installed or published.
Company tax is an explicitly reviewed standard-NZ-company worksheet, not a full
IR4 assessment. Foreign settlement uses a NZD bank and reviewed rates; native
foreign-bank statement workflows remain blocked rather than posting invented
conversions. See the root acceptance report for legal/provider and other
remaining boundaries.
