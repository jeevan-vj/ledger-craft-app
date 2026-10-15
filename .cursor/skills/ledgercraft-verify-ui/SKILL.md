---
name: ledgercraft-verify-ui
description: Browser and invoice-PDF verification for LedgerCraft. Use when taking screenshots, clicking through login/create/preview, downloading PDFs, or checking that a web feature works in the running Vite app.
---

# LedgerCraft verify UI

One screenshot is not verification. Drive the flow, then capture evidence.

Read `ledgercraft-verify` for automated + HTTP gates first. Start `pnpm dev:api` and `pnpm dev` (Vite **8080**).

## Browser

- Isolated context (do not reuse unrelated tabs).
- Desktop **1440×900** and one mobile width (**390×844**) when layout changed.
- Dismiss the PWA "New Version Available" overlay before clicking anything:

```js
document.querySelector('[aria-label="Dismiss update prompt"]')?.click()
```

- Exercise empty, error, and happy paths that the change can hit.
- Hunt regressions on other routes that share the same state.

## Auth for UI

Prefer a **real local Better Auth** user: sign up on `/signup`, confirm `/api/me`, then use the app.

Mock Supabase `sb-*-auth-token` + `**/rest/v1/**` only when the screen still depends on `supabase-js` or hosted Auth is empty. Label that evidence **UI-only, not Hono persistence**.

Never point Playwright at hosted empty Supabase as the system under test.

## Invoice create → PDF

The Edit **Preview tab** unmounts the form before `generatePreview` can read values. Click the **footer** Preview button (`div.hidden.sm:block` on desktop).

Playwright `getByRole('button', { name: /download pdf/i })` often misses the control. Click in-page:

```js
[...document.querySelectorAll('button')]
  .find((el) => (el.textContent || '').includes('Download PDF'))
  ?.click()
```

Wait for the download. Then:

1. Magic bytes `%PDF`.
2. Size > 1 KB.
3. Filename contains the invoice number (`Invoice-INV-….pdf`).
4. Thumbnail the first page (`qlmanage -t -s 1600 -o <dir> <file.pdf>` on macOS). html2canvas PDFs have almost no extractable text — **visual** check against the preview.
5. Confirm buyer, line, total, dates, notes/terms match the preview.

## Invoice form selectors

| Control | Locator |
| --- | --- |
| Number | `[data-testid="invoice-number"]` |
| Customer | `[data-testid="customer-select"]` |
| Line description / qty / rate | `[data-testid="item-description-0"]` etc. |
| Total | `[data-testid="invoice-total"]` |
| Generate preview | footer button named Preview, not the tab |
| PDF | button whose text includes `Download PDF` |

## Output

Keep files in `/tmp/ledgercraft-verify-<feature>/`:

- `01-*.png` form
- `02-preview.png` on-screen invoice
- `Invoice-*.pdf` + `.png` thumbnail

Report persistence honestly (Hono row vs mocked REST).
