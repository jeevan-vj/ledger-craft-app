# Email and AI capability honesty evidence

Captured locally on 2026-10-27 with Playwright Chromium against a fresh temporary SQLite database. The harness ran the real Hono API with `APP_ENV=demo` and the Vite app, with `OPENAI_API_KEY`, `XAI_API_KEY`, `RESEND_API_KEY`, and `RESEND_FROM` explicitly unset. All records are synthetic: organisation `Crystal Touch Cleaning`, customer `Cleancorp Ltd`, and a draft cleaning-services invoice.

## Before

- `before/01-web-receipt-scan-offered-no-ai-key.png` — the expense drawer claimed “AI Scanner Available!” even though no AI key existed. The viewport clipped the tabs themselves, but the unconditional availability claim is visible.
- `before/02-web-invoice-send-offered-no-email-key.png` — the real invoice edit footer offered Send even though no email configuration existed.

The separate reminder-modal capture was attempted but skipped after the existing list did not expose the reminder action for the synthetic record within the reasonable capture timeout.

## After

- `after/01-web-receipt-manual-fallback-no-ai-key.png` — AI Scan is absent, Upload/Camera is selected, and the manual-entry explanation is visible.
- `after/02-web-invoice-share-fallback-no-email-key.png` — invoice detail proactively explains that email is not configured and offers Share link instead, with Crystal Touch Cleaning and Cleancorp Ltd visible in the invoice below.

Each committed PNG is a 1440×900 local web render and was opened and visually inspected after capture. No provider request, production data, deployment, or secret was used.

Mobile screenshots were skipped to keep the time-box focused after the first sandboxed Chromium attempt failed and had to be rerun with GUI permission. The mobile implementation is covered by Jest and strict TypeScript in this change, but there is no visual proof. Had Expo web screenshots been captured, they would be labeled **“Expo web render at 390×844, not a native device”**; no native-device claim is made.
