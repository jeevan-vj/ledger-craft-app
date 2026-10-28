---
name: ledgercraft-verify-ui
description: Web browser, invoice-PDF, and Expo UI evidence for LedgerCraft. Use when a web or mobile UI change needs screenshots, a phone-width check, login, create, preview, a downloaded PDF, Jest or React Native Testing Library coverage, an emulator, simulator, or Expo web recording, or a pending device check.
---

# LedgerCraft verify UI

Run `ledgercraft-verify` first. One screenshot of a static render is not verification. Drive the flow, then capture it. A mock or a static render is labelled as such. Do not fabricate browser or device verification.

Web changes start `pnpm dev:api` and `pnpm dev` (Vite **8080**). Save files under `/tmp/ledgercraft-verify-<feature>/` and embed them in the pull request. The evidence table in `ledgercraft-verify` includes the web screenshot sizes and the Mobile screenshots / device checks section.

## Browser

- Use a fresh context. Do not reuse an unrelated signed-in tab.
- Every UI change: phone width **390×844**. Take a screenshot of the changed state, not only the first paint.
- Layout or styling changes: also **1440×900**.
- Dismiss the PWA overlay before clicking:

```js
document.querySelector('[aria-label="Dismiss update prompt"]')?.click()
```

- Exercise the empty, error, and success states this change can hit.
- Open the other routes that read the same state and check they still agree.

## Auth

Sign up on `/signup` with local Better Auth, confirm `/api/me`, then use the app.

A mocked session is evidence only when the screen cannot reach Hono yet. Label it **UI-only, not Hono persistence**. Do not point a browser test at hosted Supabase.

## Invoice create to PDF

The Edit **Preview** tab unmounts the form before preview can read it. Click the footer Preview button (`div.hidden.sm:block` on desktop).

Playwright `getByRole('button', { name: /download pdf/i })` often misses the control. Click in page:

```js
[...document.querySelectorAll('button')]
  .find((el) => (el.textContent || '').includes('Download PDF'))
  ?.click()
```

Wait for the file, then check:

1. `head -c 5` prints `%PDF-`. (`head -c 4` prints `%PDF`.)
2. Size is greater than 1 KB.
3. The filename contains the invoice number (`Invoice-INV-….pdf`).
4. Buyer, line, total, dates, and notes match the on-screen preview. html2canvas PDFs have almost no text to extract, so compare the preview screenshot. Render a page image with `pdftoppm` when it is installed. `qlmanage` is macOS-only and is not required.

## Invoice form selectors

| Control | Locator |
| --- | --- |
| Number | `[data-testid="invoice-number"]` |
| Customer | `[data-testid="customer-select"]` |
| Line description / qty / rate | `[data-testid="item-description-0"]` and the matching qty and rate ids |
| Total | `[data-testid="invoice-total"]` |
| Generate preview | footer button named Preview, not the tab |
| PDF | button whose text includes `Download PDF` |

## Mobile

`mobile/` is the Expo SDK 54 app. It uses npm and `mobile/package-lock.json`, and it sits outside the pnpm workspace. Jeevan tests on Android and has an iOS TestFlight build. The Mobile CI job in `ledgercraft-verify` does not replace this evidence.

### What counts

A mobile UI change needs both of these:

1. Jest and React Native Testing Library tests for the states this change can hit: loading, empty, error, and success.
2. Screenshots or a short recording from an emulator, a simulator, or Expo web when a native run is not possible. Label the platform and how it was produced (Android emulator, iOS simulator, or Expo web).

A mock or a static render is labelled as such. Do not fabricate device verification. A 390×844 screenshot of the Vite app belongs in the web Screenshots section of the evidence template.

### Platform-specific behaviour

When the diff branches on `Platform.OS`, or uses a native component such as `Switch`, the camera or image picker, the document picker, a share sheet, the Android back button, or keyboard and safe-area behaviour, name the platform that was exercised. List each other platform as a named pending device check on the **Device checks pending** line. Leave that platform unverified until the named check is done.

### Native modules and app config

A change to a native module, `mobile/app.json`, or `mobile/app.config.js` follows the runtimeVersion fingerprint policy. `mobile/app.config.js` sets `runtimeVersion: { policy: 'fingerprint' }`. A native change needs a new binary. An OTA update will not deliver it. Do not force the runtime version. OTA publishing is `ledgercraft-eas-update`. A new binary, TestFlight, or App Store Connect work is `ledgercraft-mobile-release`.

### Device checks pending

The evidence template in `ledgercraft-verify` has a **Device checks pending** line. Fill it with the named checks (platform and what to exercise), or write `none`. That line is what Jeevan tests on a phone.

## Report

Web:

- `390.png` for the phone width, and `1440.png` when you took the desktop pass
- `02-preview.png` and the PDF when the change touches an invoice or quote document
- Whether the row came from Hono or from a mock

Mobile: the screenshots or recording, the platform, how it was produced, and the **Device checks pending** line. A mock or static render is labelled as such.
