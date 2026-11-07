# Web GST settings, periods and audited returns

This follows issue115's chosen GST scope (#84, #85, #111, #24). The web settings
page now loads and persists actual organisation IRD choices; it no longer shows
mock tax configurations. The return workspace uses server-generated taxable
periods and canonical GST preparation rather than a browser quarterly calendar
or client-calculated return figures.

## Verified component behavior

- Basis, filing frequency, registration date, GST number and anchor round-trip
  through the shared validated API; changes require explicit confirmation.
- Settings saves preserve GST metadata in business-profile adapters and
  invalidate the invoice-profile query, so newly registered document previews do
  not retain stale unregistered profile data.
- The actual GST routes allow report readers; settings writes require
  `settings.write`, and source review/draft/file actions require `banking.write`.
  Read-only users retain preview, download and recalculation access.
- Worksheets use the saved basis and selected server period. The save request
  retains the server calculation fingerprint, not a browser authority over tax.
- Zero-rated versus exempt sales require a supported, reasoned classification;
  the UI does not infer classification merely from a zero tax rate.
- Retained filing records display exact original amounts, source audit metadata
  and warnings. The external myIR reference requires an explicit already-filed
  confirmation. Nothing submits to IRD.
- An unverified legacy draft is labelled as such, with no invented invoice basis
  and no filing action. Preparing a replacement creates a new draft instead of
  mutating the retained source snapshot.
- Read-only recalculation shows current books using original settings beside
  recorded amounts, with the server's exact difference and changed-settings
  warnings. No saved figures or filing references are overwritten.
- PDFs retain canonical decimal text, hybrid labels and myIR mapping warnings;
  omitted boxes are never presented as zero.

## Local checks

Under Node22.23.4, eight affected suites /32 tests passed in
`/tmp/issue115-web-gst-frozen-targeted.log`. Scoped ESLint reports0 errors and47
existing route FastRefresh warnings. Full app TypeScript currently has no errors
in these GST files; the combined parent verification records final project
results after all specialists finish.

Tests include the actual route guards, profile cache invalidation, saved/fresh
figures, explicit filing confirmation, read-only permissions, hybrid periods,
exact PDF values, legacy handling, source classification and mapping warnings.
Failing-before-fix captures include `/tmp/issue115-web-settings-red-valid.log`,
`/tmp/issue115-web-profile-gst-red.log`, `/tmp/issue115-web-profile-cache-red.log`,
`/tmp/issue115-web-readonly-red.log`, `/tmp/issue115-web-gst-routes-red.log`,
`/tmp/issue115-web-recalculation-red.log`, `/tmp/issue115-web-legacy-return-red.log`
and `/tmp/issue115-web-pdf-warning-red.log`.

## Browser verification

PASS against real Hono/SQLite and production preview build `864ff69fb4d9`.
The script `scripts/issue115-gst-web-proof.mjs` ran independent stable desktop
1440×900 and phone390×844 Chromium contexts with zero page errors. Evidence here
contains14 screenshots,2 downloaded PDFs, raw results and the browser log. This
is responsive web verification, not a native mobile-device test.

Both cases signed up through real HTTP, configured registration through the UI,
and created synthetic invoices, customer receipts, approved expenses and a
part-paid supplier bill. Closed October2026 has a confirmed30November due date;
November's15January exception appears separately in the period overview.

Independent expectations passed:135 invoice-basis,141 payments-basis and171
hybrid. The141 payments draft was saved with a server fingerprint, downloaded as
an actual PDF and recorded as already filed with a synthetic myIR reference.
After changing to hybrid and adding late October activity, current hybrid GST
became186. Read-only recalculation using original payments settings returned156,
a15 difference, while the original141, filing reference and fingerprint remained
unchanged. See `results.json` for exact API records and assertions.

Visual review covered the phone worksheet/review/save frame and original-basis
comparison. A real390px button-overflow assertion first failed; wrapping saved
return action labels fixed it, and the same bounds assertion passed in this run.
The six saved-return component tests also passed after the CSS change.

The driver captures viewport screenshots on both devices. Earlier oversized
element captures caused the responsive app to remount and discard transient
worksheet state during Chromium capture; switching to viewport capture removed
that driver side effect. Production behavior and monetary assertions were not
changed to obtain the passing result. Earlier failing or clipped captures are
excluded from this evidence directory.

Parent combined verification also passed840 web tests and508 API tests; these
counts cover the coordinated GST implementation beyond this web subtask.

No real IRD filing, provider delivery, native-device pass or production-data
change is implied by these checks.
