---
name: ledgercraft-verify-ui
description: Browser and invoice-PDF verification for LedgerCraft. Use when a web UI change needs screenshots, a phone-width check, login, create, preview, or a downloaded PDF in the Vite app.
---

# LedgerCraft verify UI

Run `ledgercraft-verify` first. One screenshot of a static render is not verification. Drive the flow, then capture it.

Start `pnpm dev:api` and `pnpm dev` (Vite **8080**). Save files under `/tmp/ledgercraft-verify-<feature>/` and embed them in the pull request.

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

1. First bytes are `%PDF` (`head -c 5`).
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

## Report

- `390.png` for the phone width, and `1440.png` when you took the desktop pass
- `02-preview.png` and the PDF when the change touches an invoice or quote document
- Whether the row came from Hono or from a mock
