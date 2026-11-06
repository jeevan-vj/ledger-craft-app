# Mobile statement warning: expected and actual

This is the Expo web app in Chromium at 390×844, against the real local Hono API
and the dedicated `/tmp/ledgercraft-accountant-followup.sqlite` verification
database. No signed iOS or Android device was exercised.

The fixture deliberately inserts historical statement/adjustment rows with no
posted journal. It models a pre-fix metadata-only bank fee; it is not an ordinary
bank import, which posts cash. The new API rejects an equivalent new fee
declaration with422. The original historical rows remain available for review.

| Check | Expected | Actual |
| --- | --- | --- |
| Statement closing | −10.00 | −10.00 |
| Posted/adjusted book balance |0.00 /0.00 |0.00 /0.00 |
| Difference/readiness | −10.00 / false | −10.00 / false |
| Legacy unposted adjustment | Excluded, with visible review warning | Warning and instructions visible |
| Press completion on unresolved statement | No UI completion request |0 POST requests |
| Direct completion request |400; statement remains in progress |400; unchanged ledger/status |
| Browser page errors | None | None |

Both screenshots were visually inspected: [warning and figures](01-legacy-warning-ledger-difference-phone.png)
and [blocked completion control](02-unresolved-completion-blocked-phone.png).
The functional completion guard is tested by observing requests and checking the
server result, rather than inferring behavior from the web button's markup.
Raw values are in [results.json](results.json), with the final [browser log](browser.log).

## Verification

The warning tests were written before production changes:2 failed/3 passed
because no warning was displayed and newly received warnings did not invalidate
the previous review. After the change,5/5 component tests passed. Existing balance
change, load failure and reviewed-success assertions remain intact.

Node20 commands, each exit0:

```sh
cd mobile
npm test -- --ci --watchAll=false
npm run type-check
npm run lint
EXPO_NO_TELEMETRY=1 SENTRY_DISABLE_AUTO_UPLOAD=true npx expo export --platform ios --output-dir /tmp/ledgercraft-accountant-followup-ios
```

Jest:115 suites /551 tests passed. An existing worker teardown warning remains;
the command did not use `--forceExit`. TypeScript:0 errors. Lint:0 errors /74
warnings. iOS bundle export succeeded; bundle export is not native execution.
Scoped component and proof-script lint also exited0 without warnings.

Reproduce the browser proof with Node24 after starting the isolated local API
on3001 and Expo web on8081:

```sh
ACCOUNTANT_TEST_DATABASE=/tmp/ledgercraft-accountant-followup.sqlite node scripts/accountant-mobile-warning-proof.mjs
```

The mobile app has no journal administration/list view that reads the old first
debit/credit summary fields. Its manual journal form creates a two-line journal;
the new API multi-line response fields require no mobile presentation change.

Device checks pending: installed iOS and Android warning readability, large-text
layout, native accessibility state, safe-area/keyboard behavior and review/complete
gestures. No deployment, provider messages or IRD filing occurred.
