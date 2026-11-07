# GST settings and period API evidence

Implemented for the GST slice of epic #115 (#84/#111/#24). The separate
[tax/reports baseline audit](tax-reports-audit.md) describes the state before this
implementation, not the final branch state.

## Implemented

- Nullable legacy profile metadata: `gstRegisteredFrom`, `gstAccountingBasis`
  (invoice/payments/hybrid), `gstFilingFrequency` (monthly/two_monthly/six_monthly)
  and integer ending-month `gstPeriodAnchor`. Missing values are explicitly
  unconfigured/review-required; no old registration dates or basis are guessed.
- Registered NZ settings require a valid IRD number, date, basis, frequency and
  anchor. Shared validation normalises valid8/9-digit numbers and applies both
  check-digit weight sets. `NZ`, `NZL` and `New Zealand` country labels are
  recognised; non-NZ profile tax identifiers are not subjected to NZ validation.
- New explicit NZ profile registration needs the effective date. Unrelated
  profile edits preserve existing metadata. The dedicated settings endpoint is
  scoped to NZ companies and uses the authenticated organisation.
- `GET/PUT /api/tax/gst-settings`, `GET /api/tax/gst-periods?asOf=YYYY-MM-DD`, and
  transaction-local `gstSettingsInTx` for server calculations/saves.
- Registration-clipped first periods; monthly, two- and six-monthly calendars;
  published national holiday/weekend moves; 15January/7May exceptions. Due dates
  retain a myIR/regional-anniversary confirmation warning. [Calendar sources](nz-calendar-sources.md).
- Period rows map saved drafts/filed references/netGST, and retain mismatched
  old filed dates rather than rewriting them. Rejected records are not shown as
  filed. Basis changes preserve earlier filing snapshots and warn to confirm
  IRD approval.
- Changed already-known registration date/frequency/anchor after a filed GST
  record returns409, requiring an audited IRD transition. The same guard applies
  to the profile endpoint. Explicit owner completion of legacy NULL fields is
  allowed without guessing metadata or rewriting the original filing.

## Test-first evidence

- Initial settings route/profile tests:3 failed before implementation,
  `/tmp/issue115-gst-settings-api-red.log`.
- Contract/calendar tests initially failed because the module did not exist,
  `/tmp/issue115-gst-settings-contract-red.log` (no tests collected; not claimed
  as four executed assertion failures).
- Real mobile-country alias case returned422 before the shared country helper,
  `/tmp/issue115-gst-country-red.log`.
- Filed calendar rewrite returned200 before the transition guard,
  `/tmp/issue115-gst-calendar-transition-red.log`.
- Legacy NULL completion returned409 before allowing explicit confirmation,
  `/tmp/issue115-gst-legacy-completion-red.log`.

Final commands use Node24.22.1 and pnpm11.19.0:

| Command | Result |
| --- | --- |
| `pnpm --filter @ledgercraft/api exec vitest run src/modules/tax/gst-settings.test.ts` | Exit0,1suite/5tests passed, no skips; `/tmp/issue115-gst-settings-api-final2.log` |
| `pnpm --filter @ledgercraft/contracts exec vitest run src/gst-settings.test.ts` | Exit0,1suite/4tests passed; `/tmp/issue115-gst-settings-contract-final.log` |
| `pnpm --filter @ledgercraft/api type-check` | Exit0; `/tmp/issue115-gst-settings-api-types-final.log` |
| `pnpm --filter @ledgercraft/contracts exec tsc --noEmit` | Exit0; `/tmp/issue115-gst-settings-contract-types-final.log` |
| Scoped ESLint for owned settings/profile/calendar files | Exit0, no output/errors; `/tmp/issue115-gst-settings-lint-final.log` |
| `node api/sqlite-migrations/verify.mjs` | Exit0; SQLite baseline/constraints/exact decimals/tenant foreign keys passed |

The integrated API test prepares and reviews a server GST calculation, saves a
canonical draft, records a synthetic myIR reference, changes current basis,
and reloads the earlier record with its original payments-basis snapshot intact.
It is not an actual IRD submission or current-law certification.

## Migration provenance

`0028_gst-registration-settings.sql` contains only four nullable `ALTER TABLE
ADD` statements. Drizzle's stale0004 metadata first proposed an unrelated table
rebuild; that output was not applied. A temporary baseline derived from the
current generated snapshot with only the four new columns removed let Drizzle
generate the genuine additive delta. The reviewed generated SQL was copied to
0028; old metadata and applied SQL were restored unchanged. The official
`generate-sqlite-migrations.mjs` regenerated the manifest/checksums. No checksum
was hand-edited, and no existing row or journal was rewritten. The0028 bytes are
frozen after test application.
