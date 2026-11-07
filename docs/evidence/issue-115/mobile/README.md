# Mobile GST verification

Verified 7 November 2026 (Pacific/Auckland) against the local Hono API and migrated SQLite database. The browser proof uses Expo web in Chromium at 390×844; these screenshots do not establish installed iOS/Android acceptance. All companies, transactions and external filing references are synthetic. No return was submitted to IRD.

## Expected accounting results

Each isolated company is GST registered from 1 October 2026, two-monthly with ending-month anchor 10. Its first partial period is 1–31 October, due 30 November. An invoice contains net $1,000 + $150 GST, with a $575 receipt. A received supplier bill contains net $200 + $30 GST, with a $115 payment. An approved paid expense is $115 including $15 GST.

| Registered basis | Expected output GST | Expected input GST | Expected net GST | Actual |
| --- | ---: | ---: | ---: | --- |
| Payments | $75.00 | $30.00 | $45.00 | Passed |
| Hybrid | $150.00 | $30.00 | $120.00 | Passed |
| Invoice | $150.00 | $45.00 | $105.00 | Passed |

The UI saves the registered basis, frequency, anchor, GST number and registration date through the API. It loads server periods, prepares the selected closed period, explicitly reviews adjustments, saves a canonical fingerprinted draft, downloads an actual PDF, records a synthetic external myIR reference, reloads the filed period and downloads the filed record. Attempts to change the filed return return HTTP409. `results.json` retains API snapshots and assertions; each basis has five screenshots and two PDF downloads. No browser page errors are accepted.

The PDF uses saved server figures, GST number, registration date, basis and calculation fingerprint. It is labelled draft or filed externally and explicitly says the app does not submit to IRD. Zero-rated/exempt classification requires explicit amounts, source and reason; omitted server myIR boxes remain omitted, not replaced with zero. Calculation output requires accountant/myIR confirmation and is not IRD certification.

## Regression checks

Node20.20.2, from `mobile/`:

```sh
npm test -- --ci --watchAll=false
npx tsc --noEmit
npm run lint
npx expo export --platform ios --output-dir /tmp/ledgercraft-issue115-mobile-ios-locked
```

Final mobile suite: **123 suites /588 tests passed**, exit0. TypeScript: exit0. ESLint: zero errors, 74 existing warnings. iOS JavaScript/Hermes bundle export completed (`index-c55fe442a5467a4e52fd3bc99cdb492f.hbc`); this is build evidence, not a native device run. Jest reports its existing worker-teardown warning after passing. Full logs are retained alongside this document.

Coverage includes all six invoice HTML themes for valid registration and nonregistration, effective registration dates, legacy metadata review, exact buyer-identifier thresholds including authoritative FX base totals, onboarding metadata, shared DTO parsing, server fingerprint review, immutable draft revisions, company cache clearing, permission gates and native PDF cancellation handling. The new `jspdf@3.0.1` dependency supplies actual Expo-web PDF downloads; native PDF generation keeps Expo Print/Sharing.

Reproduce the browser proof from the repository root with local API3001 and Expo8081 running:

```sh
node scripts/issue115-mobile-gst-proof.mjs
```

The script creates local synthetic records. In this managed environment the driver needs access to the host network to reach the local servers.

## Remaining acceptance

An installed iPhone/Android run must still verify authenticated keyboard/layout behavior, native invoice preview, Print/share sheets, file-provider cancellation and background/resume. No native SDK/emulator/device or store credentials are available here. The broader recurring, banking and financial-report parity gaps remain in [the initial mobile audit](../mobile-audit.md); this PR implements the selected GST scope, not every child of epic115.
