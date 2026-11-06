# Issue #115: mobile acceptance audit

Audit date: 7 November 2026 (Pacific/Auckland). Base: `2397140`, after merged PR159.
This is a read-only acceptance audit of the linked issue specifications and
current source. Open issue state is not proof that no implementation exists;
existing code and local tests are recorded separately from native acceptance.

## Follow-up implementation

The selected GST scope (#84/#85/#111/#24) was implemented after this initial audit. See [mobile GST evidence](mobile/README.md) for the final expected/actual checks, screenshots, PDFs and remaining native acceptance. The table below records the baseline; its GST implementation gaps are superseded by that evidence. Other epic gaps remain open.

## Linked issue status

| Issue | Current implementation | Concrete remaining acceptance gaps |
| --- | --- | --- |
| [#106](https://github.com/jeevan-vj/ledger-craft-app/issues/106), closed | `AccountDeletionScreen` is reachable through Settings navigation; requires current password and typed DELETE, calls Hono then sign-out, explains company deletion/ownership limits and export-first record retention. UI regressions exist. | Installed-device token-clearing and destructive deletion smoke remain native acceptance, not proven by component tests. The export-first link opens Reports, whose actual report export UI is still missing (see #25). |
| [#30](https://github.com/jeevan-vj/ledger-craft-app/issues/30), open | Release/build configuration and local testing/device-readiness instructions exist. | Actual installed TestFlight build IDs/status, standard and compact iPhone authenticated flows, Android release smoke, background/cold start/network/session recovery, native keyboard, accessibility, deep links/share sheets are unverified. This Linux runtime has no adb, Android emulator, xcodebuild or `/dev/kvm`; no store submission is authorized by this issue. |
| [#28](https://github.com/jeevan-vj/ledger-craft-app/issues/28), open | Recurring list/run history and pause/resume/end exist. | `RecurringSchedulesScreen.tsx:13` creates only a fixed monthly expense. No invoice/bill template create/edit, interval/start/end/limit/timezone controls, preview, capability-gated auto-send, generated-document links or next-attempt display. Action failures are not caught by the `act` handler. The screen explicitly sends invoice/bill users to web. No recurring screen tests were found. |
| [#21](https://github.com/jeevan-vj/ledger-craft-app/issues/21), open | Bank list/detail/create/edit/delete attempt, manual transactions, same-currency atomic transfer UI and Hono adapters exist. Money stays text through transfer payloads. | No default-payment-account designation; detail displays metadata opening/current balance but no movement summary or transaction pagination. `BankTransferFormScreen.tsx:21` filters destination accounts to the source currency and never sends an exchange-rate ID, so reviewed-rate cross-currency transfer is unavailable. Native/offline integration acceptance remains unverified. |
| [#22](https://github.com/jeevan-vj/ledger-craft-app/issues/22), open | Native CSV picker, supported-header parser, five-row preview, duplicate-skipping apply, server suggestion feed, combined invoice/bill allocation and remainder splits exist. Existing-payment matching, statement setup and summary/completion were added by the accounting follow-up. | No column-mapping UI or detected duplicate counts before apply; parser throws the first row error rather than presenting a complete row-validation preview. No native bank-side timing-adjustment editor. Bank statement setup is nested in an existing-settlement flow rather than a standalone session workspace. Picker cancellation/apply/session resume are not covered by a screen-level test. Device picker, restart/background resume and large-file responsiveness are unverified. |
| [#24](https://github.com/jeevan-vj/ledger-craft-app/issues/24), open | Reports show invoice-basis GST totals; `GstPreparationPanel` supports explicit dates, invoice/payments bases, reviewed adjustments, exact figures and saved draft reload; states that drafts do not submit to IRD. | No mobile organisation GST accounting-basis/filing-frequency editor, full persisted IRD/reconciliation snapshot overview, dedicated Mark filed/myIR confirmation reference, or PDF export/share. `gstPreparationApi` exposes prepare/review/draft save/get only. Native quarter-boundary/share acceptance remains unverified. |
| [#25](https://github.com/jeevan-vj/ledger-craft-app/issues/25), open | Server financial endpoint supplies P&L/balance sheet/cash/aging/tax summary, cash/accrual toggle, this-month/this-year choices, posted-data/empty/error states and exact display. | The mobile adapter uses handwritten interfaces and does not parse shared response schemas. No custom period, NZ FY presets, comparison, entity/account filters, report columns, journal/account drill-down, full trial-balance table, PDF/CSV export or native share. “This year” currently starts January1, not an organisation NZ financial-year preset. Permission/offline errors share the generic unavailable state. |

## Existing verification rerun

Node20.20.2; command from `mobile/`:

```sh
npm test -- --ci --watchAll=false --runTestsByPath \
  src/screens/settings/AccountDeletionScreen.test.tsx \
  src/features/banking/model/statementImport.test.ts \
  src/features/banking/api/bankingApi.test.ts \
  src/features/banking/model/reconciliationMath.test.ts \
  src/screens/reports/ReportsScreen.test.tsx \
  src/components/banking/StatementSummaryPanel.test.tsx \
  src/components/reports/GstPreparationPanel.test.tsx
```

Result: **exit0, seven suites /39 tests passed**. Log:
`/tmp/epic115-mobile-audit-tests.log`. This confirms existing tested behavior,
not any missing acceptance criteria and not actual native-device execution.
Earlier browser evidence is in `docs/evidence/accounting-completion/mobile/`
and `docs/evidence/accountant-followup/mobile/`; those captures are Expo web.

## Proposed coherent #112 / #25 slice

1. Replace handwritten mobile report types with shared `FinancialReportQuery`,
   `FinancialReportResponse`, `GeneralLedgerResponse` and response-schema parsing.
   Preserve exact strings and reject malformed/numeric amounts before display.
2. Add validated custom dates plus NZ FY/YTD/previous-FY presets, using the
   existing shared `financialYearForDate` helper and organisation timezone/year
   settings. Keep date-only inputs stable across device timezones. Defaults must
   be described accurately; preserve GST's separate filing-basis selection.
3. Add comparison and supported account/customer/vendor filter controls. The
   existing Hono query already accepts these fields. Do not offer category
   filtering while journal lines have no category linkage.
4. Consume server monthly/quarterly column results after the #112 contract/API
   implementation. Render compact scrollable columns with text labels, without
   summing authoritative totals or reimplementing periods in components.
5. Expose P&L/balance-sheet/cash/trial-balance account rows and AR/AP documents.
   Account rows load `/api/reports/accounts/:id/statement` or general-ledger
   results using the same active period/basis/filters, showing exact postings.
6. Export the validated current report definition to CSV and PDF, then use the
   existing Expo file/print/sharing dependencies and cancellation helper. Keep
   financial numbers server-owned; reuse shared CSV formula-neutralisation and
   HTML escaping. Native sharing is a named pending device check until run.
7. Test first: shared-schema validation; query round trips; Apr1/Mar31 and leap
   boundaries; timezone stability; comparison/filter invalidation; loading,
   empty, denied/offline/error/success; negative/zero values; drill-down; actual
   export contents and share cancellation. Then capture real Hono-backed Expo
   web at390×844 and a compact width. Device acceptance remains explicit.

No code was changed during this audit. Production provider configuration and
native access cannot be substituted with mocked actions or Expo screenshots.
