# Business accounting verification

Local NZ business-flow review on **6 November 2026**, starting from `main`
commit `599b622`. This report distinguishes real browser operation, public-API
accounting checks, and device or filing work that remains unverified.

## Reference company and independent worksheet

The reference business is an NZD service company registered for 15% GST. It
creates two consulting invoices, records full and partial receipts, approves
taxable and GST-free expenses, receives a supplier bill and makes a partial
supplier payment. The API reference also introduces owner capital and transfers
money between business bank accounts.

| Transaction | Net | GST | Gross | Paid/received |
| --- | ---: | ---: | ---: | ---: |
| Consulting invoice A | 1,000.00 | 150.00 | 1,150.00 | 1,150.00 |
| Consulting invoice B | 400.00 | 60.00 | 460.00 | 230.00 |
| Approved operating expense | 200.00 | 30.00 | 230.00 | 230.00 |
| Approved GST-free expense | 50.00 | 0.00 | 50.00 | 50.00 |
| Received subcontractor bill | 300.00 | 45.00 | 345.00 | 69.00 |

Owner capital is **5,000.00**. An internal transfer of **1,000.00** changes
neither income nor GST. Independently expected balances are:

| Check | Expected NZD |
| --- | ---: |
| Revenue | 1,400.00 |
| Expenses | 550.00 |
| Profit | 850.00 |
| Accounts receivable | 230.00 |
| Accounts payable | 276.00 |
| Combined ledger cash, including owner capital | 6,031.00 |
| Output GST | 210.00 |
| Input GST | 75.00 |
| Invoice-basis GST payable | 135.00 |
| GST-return gross sales / purchases | 1,610.00 / 625.00 |
| Balance-sheet assets / liabilities / equity | 6,336.00 / 486.00 / 5,850.00 |

The balance sheet presents GST gross: assets include 75.00 input GST and
liabilities include 210.00 output GST. Netting those GST accounts gives the
equivalent assets 6,261.00 and liabilities 411.00. A subsequent empty period
has zero period profit while retaining the same cumulative equity. Each
journal and the trial balance must balance, and a second company must not see
these records.

The mobile operating case deliberately excludes capital introduction and the
internal transfer. Its expected cash is **1,031.00**, with the same profit,
receivables, payables, and GST position.

## What was exercised

- **Web:** real UI signup, company/GST setup, customer creation, first invoice,
  payment, approved expense, account creation and posted-balance display,
  financial-report navigation, GST figures, a downloaded invoice PDF and an
  unauthenticated buyer's paid-invoice share view. The supporting second invoice,
  exempt expense, supplier bill, capital journal and transfer use the real HTTP
  APIs; they are not mocked responses or direct database inserts.
- **Mobile:** real Expo web UI signup and company setup, two invoices, full and
  partial receipts, taxable and GST-free expenses, explicit expense approval,
  vendor creation, supplier bill receipt/payment, reports, selected-period GST
  preparation, draft save and draft reload. This case uses no API authentication
  or transaction preseed. Phone and compact-phone browser layouts are covered.
- **GST web preparation:** API-created accounting reference, then real wizard
  custom period selection, preparation, draft save/reload and PDF export.
  The 1–30 April period and explicit 28 May due date persist in the draft and
  PDF. Figures include the received bill and exclude unapproved expenses.
- **API:** real temporary SQLite and migrations through public HTTP routes,
  including company isolation, journal balances, reports, selected-bank
  supplier posting, prior-period profit, and GST draft persistence. See the
  [API evidence](api/README.md) and
  [independent report/ledger JSON](api/consulting-business-worksheet.json).

Final web evidence uses **Chromium against a local production-preview build**;
mobile evidence uses **Expo web**. Both use real local Hono and SQLite. The
invoice PDF has a valid PDF header, exceeds 1 KB, and was visually checked
against its preview. The buyer view at phone width is unauthenticated and shows
the paid snapshot. GST draft save/reload and its PDF also pass. These checks do
not prove native iOS/Android behavior or a production deployment.

## Reproduced defects and changes

| Defect | Local correction |
| --- | --- |
| Explicit supplier bank selection still posted to generic account 1110 | New supplier payments use the selected bank ledger; historical journals are not rewritten. |
| A later balance sheet omitted prior unclosed profit | Equity includes cumulative unclosed income; period P&L stays restricted to its dates. |
| Chart-of-accounts `currentBalance` snapshots stayed zero, and account mutations were disconnected | The web screen reads posted ledger balances, uses Hono create/update, defaults to NZD, and deactivates accounts while retaining history. |
| Mobile expense UI displayed net + GST but saved net as the API gross amount | Create/edit use the shared exact total; edit separates stored gross and GST before repricing. |
| Mobile expenses could not be approved, and new bills required a web-created vendor | Explicit expense status controls and mobile vendor creation complete those operating paths. |
| Expo web signup contact details disappeared on onboarding | Non-password onboarding drafts use browser storage on web and SecureStore on native. |
| GST preparation omitted supplier bills or selected unposted data, and default tax storage could use the legacy stub | Web and mobile share typed, company-scoped `GET /api/tax/gst-preparation`; tax API is on by default unless explicitly disabled. |
| Current document status could erase historical GST gross figures after a later cancellation or restoration | Gross preparation follows immutable journal movements in the selected period, keeping historical gross figures aligned with output/input GST. Deleted foreign-currency sources remain excluded. |
| Partial/private-use expense GST could be claimed at the wrong percentage | Claim percentages apply exactly once to the preserved raw tax amount; the journal posts only the allowed GST claim. |
| An expense could use a revenue or GST account as its paid-from source | Explicit sources are restricted to bank, cash, credit-card or loan accounts; the API rejects invalid choices with 400 and the web/mobile pickers filter them. |
| Fixed calendar-quarter assumptions and unchecked reconciliation could produce misleading preparation | The web wizard supports registered custom periods and an explicit myIR due date, and guards loading/failure states before review/save. |
| A limited company could be offered an unsupported personal-band income-tax estimate | Automatic income-tax return calculation is explicitly unavailable; existing records and accounting reports remain readable. |
| Matching imported rows to already recorded payments or expenses could duplicate ledger effects | Immutable corrections retain the original settlement; targeted match/retry/undo checks and statement completion reconcile Operating 5,031.00 plus Savings 1,000.00 to cash 6,031.00. |
| Reconciliation completion treated an uncomputed book balance as zero | Completion uses ledger balances, with a regression preventing prior opening funding from being counted twice. |

Opening values on account metadata are not a substitute for an opening journal.
The Accounts screen states that distinction and labels its report-derived
figures as posted ledger balances. Statement balances are a separate
reconciliation book; importing or matching a statement must not silently create
a second sale, payment, expense, or GST claim.

Historical filing preparation includes the original posting, later
cancellation and reinstatement in their respective journal periods. A selected
period containing negative gross sales/purchases or negative output/input GST
requires manual review; it cannot proceed as an ordinary prepared draft through
the guarded flow. A **negative net position alone** is a normal GST refund and
does not trigger that restriction.

The separate claim-percentage regression uses gross expense 230.00 with raw GST
30.00. A 50% claim posts input GST 15.00 and cost 215.00. A 25% private-use
reduction gives input GST 22.50; combining 50% claimability and 25% private use
gives input GST 11.25. Raw tax remains 30.00, so reloading or editing does not
apply the percentage a second time. These are GST-claim checks, not an
income-tax deductibility determination.

## Reproduce

Use the existing checkout and local services: Hono on 3001, Vite on 8080 and
Expo web on 8081. Use a dedicated local database such as
`api/.data/business-verification.sqlite`, run its reviewed migrations, and keep
production credentials out of the test configuration.

```bash
# Repository root, Node 24:
pnpm --filter @ledgercraft/api exec vitest run \
  src/modules/tax/business-accounting.e2e.test.ts \
  src/modules/tax/gst-preparation.test.ts

# Real browser proofs, Chromium at /usr/bin/chromium:
node scripts/business-web-proof.mjs
node scripts/business-mobile-proof.mjs
node scripts/business-gst-proof.mjs
```

The scripts create synthetic local companies and transactions. Inspect each
script's environment overrides before running it. Default outputs are under
`/tmp/ledgercraft-business-web`, `/tmp/ledgercraft-business-mobile` and the GST
proof's configured output directory. Do not treat the older mocked accountant
browser suites as proof of persistence for this review.

## Validation status

| Final check | Runtime | Result |
| --- | --- | --- |
| Web unit tests | Node 22 | 119 suites, 704 tests passed |
| Web production build and version verifier | Node 22 | Passed; version 0.0.8, build `ffba132f7715` |
| Web lint | Node 22 | 460 errors / 118 warnings; existing 468-error gate passed |
| Web TypeScript | Node 22 | 648 errors; existing 728-error gate passed; not a clean typecheck |
| Production-preview web business proof | Chromium | Passed, including invoice PDF, unauthenticated paid share and email fallback |
| GST wizard draft/reload/PDF proof | Chromium | Passed; gross 1,610.00 / 625.00, GST 210.00 − 75.00 = 135.00 |
| API final suite | Node 24 | 81 suites, 373 passed, 1 existing credit-note skip (374 total) |
| Shared contracts suite | Node 24 | 28 suites, 127 tests passed |
| API and shared contracts strict TypeScript | Node 24 | Passed cleanly |
| Mobile Jest CI suite | Node 20 | 103 suites, 505 tests passed without `--forceExit`; existing query-timer teardown warning |
| Mobile strict TypeScript / lint | Node 20 | TypeScript clean; lint 0 errors / 75 warnings |
| Mobile iOS export | Node 20 | Passed |
| Mobile full business browser proof | Expo web / Chromium | Passed, including active paid-from account picker |

Targeted checks also pass for cross-period cancellation/reinstatement gross
figures, deleted foreign sources, partial/private claims and reconciliation
corrections. All final automated and local browser checks listed above passed
their stated gates. Native-device checks remain unverified. Release built-in
checks (3) and web source-map check (1) pass.

Saved browser evidence includes [web results](web/results.json),
[the invoice PDF](web/first-invoice.pdf), [GST results](gst/result.json) and
[the GST preparation PDF](gst/gst-preparation.pdf), alongside the numbered
screenshots in those directories. The [mobile results](mobile/results.json)
and 17 numbered mobile screenshots document the separate operating case.
The parity report check passes, but the
product inventory remains 6 of 25 available, 17 partial and 2 missing; this
scenario does not establish complete product parity.

## Remaining boundaries

- GST preparation is explicitly **invoice basis and NZD only**. The independent
  payments-basis alternative would be output GST 180.00 minus input GST 39.00 =
  141.00, but that alternative is not implemented by this preparation flow.
  Foreign-currency preparation is unsupported; excluded foreign sources do
  not establish an FX conversion or filing workflow.
- Saving a GST draft or exporting a PDF does not submit a return to IRD. The
  business must confirm its registered period, due date and filing details in
  myIR. The synthetic company has no real IRD/GST registration credential; no
  real filing was submitted in this verification.
- Automatic company income-tax return calculation is unsupported. Profit,
  ledger and GST preparation evidence do not certify income-tax compliance.
- Native signed **iOS and Android** checks remain: onboarding persistence,
  keyboard/safe areas, expense approval, vendor/bill payment, and GST
  preparation/save/reload. Expo web is the evidence platform here.
- Mobile manual capital journals remain unavailable; opening capital and
  advanced journal work use the web/API accounting workflow. The documented
  mobile operating case therefore excludes capital and internal transfers.
- Matching an imported row to an already existing **supplier bill payment** is
  unsupported by the present reconciliation identity model. The verified
  supplier workflow imports the row and accepts it against the unpaid bill;
  it does not first record a second payment and then match it. This boundary
  requires an additive persistence change before that alternative can be
  claimed as supported. Unsafe legacy confirmed invoice/bill matches return
  409. Existing invoice payments and approved expenses have supported matching
  paths; unpaid invoice/bill settlements use the accept operation.
- Email delivery is not configured in the local environment; invoice link/PDF
  fallback is used. No production email, external provider or deployment pass is
  claimed.
