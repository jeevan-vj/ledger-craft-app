# Invoice import Phase 3b mobile evidence (issue #94)

Captured locally on 2026-10-26 against a fresh temporary SQLite database with `APP_ENV=demo`, OpenAI/xAI keys explicitly unset, and the deterministic mock extractor.

> Every screenshot is an **Expo web render at phone size (390×844), not a physical device**. All accounts, contacts, documents, and business details are synthetic demo data.

## Screenshots

1. `01-import-entry.png` — permission-gated Import entry point on the invoice list.
2. `02-source-picker.png` — camera and PDF/image file source choices.
3. `03-uploading-processing.png` — delayed upload proving visible upload progress before extraction.
4. `04-review-original.png` — enlarged original PDF preview reached by tapping the review card.
5. `05-direction-third-party-warning.png` — required Sales choice and Cleancorp / Crystal Touch Cleaning buyer-created warning.
6. `06-duplicate-warning.png` — explicit duplicate acknowledgement required before commit.
7. `07-totals-mismatch-block.png` — server-reported totals mismatch blocks the draft bill action.
8. `08-committed-draft-original-link.png` — committed draft invoice detail with locked source provenance and View original action.
9. `09-read-only-denied.png` — direct navigation by a read-only member shows the explicit denied state.

## Verification boundary

- Verified locally: Better Auth browser session, organisation permission handling, PDF/image file picker path, upload/extract/review, editable fields, confidence treatment, required direction, third-party warning, contact selection, duplicate acknowledgement block, totals mismatch block, draft commit, detail navigation, and source-document action presence.
- Harness data: organisation `Crystal Touch Cleaning`, customer `Cleancorp Ltd`, vendor `Sparkle Supplies Ltd`, and the synthetic Cleancorp PDF, photo-style JPG, supplier-bill PDF, and mismatch/prompt-injection fixtures. The screenshot run uses the browser document-picker route; no real customer data or provider credentials are used.
- Browser support: the existing `react-native-web` and `react-dom` dependencies were sufficient. No new Expo web packages were added; `@expo/metro-runtime` was not needed.
- Screenshot checks: all nine PNG files are exactly 390×844. Sizes range from 14,518 to 78,814 bytes, below the 300 KB limit.
- Not verified: camera capture in headless Chromium, a physical iOS or Android device, real OpenAI/xAI extraction, production/Cloudflare/object storage, posting or journals, payment, email, EAS build/submit/update, or a hosted environment.

## Gate results

Run locally with Node 24.22.1 on 2026-10-26:

- `pnpm test:api` — **61 files passed; 246 tests passed, 1 skipped**. The issue baseline was 245 passed + 1 skipped; the added CORS preflight regression is the additional pass.
- `pnpm test:contracts` — **25 files passed; 99 tests passed**.
- `pnpm exec tsc --noEmit -p tsconfig.app.json --pretty false` plus `tsconfig.node.json`, followed by `.github/scripts/ci-baseline-gate.mjs` — **663 errors**, below the **728** ceiling (`tsconfig.node.json` passed; the app command retains the accepted debt).
- `pnpm lint` plus `.github/scripts/ci-baseline-gate.mjs` — **462 errors / 113 warnings**, below the **468-error** ceiling.
- `cd mobile && npm run type-check` — **passed**.
- `cd mobile && npm run lint` — **0 errors / 78 warnings**, exactly the existing warning baseline and no new warnings.
- `cd mobile && npm test -- --ci --watchAll=false` — **65 suites passed; 311 tests passed**, including the new access, commit-decision, API-client, web-session, linking, and browser-file tests. Jest force-exited one worker after success because an existing suite left a timer/open handle; no test failed.
