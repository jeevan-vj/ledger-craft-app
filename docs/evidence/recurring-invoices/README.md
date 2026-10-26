# Recurring invoices evidence (#107)

Captured by `scripts/recurring-invoices-demo.sh` (wraps `scripts/recurring-invoices-screens.mjs`):
fresh temporary SQLite DB, `APP_ENV=demo`, OpenAI/xAI/Resend keys unset (healthz reports
`"email":"unavailable"`), Chromium headless at 1440x900, timezone Pacific/Auckland.
Demo data only: organisation **Crystal Touch Cleaning**, customer **Cleancorp Ltd**. No email is sent.

| File | Shows |
| --- | --- |
| `01-editor-repeat-panel-preview.png` | Invoice editor (`/invoices/new`) with "Repeat this invoice" on: interval/unit, day of month, start date + time (Pacific/Auckland), Ends (never / on date / after N), Delivery (draft / send automatically) and the server-computed **Next 5 dates** preview. |
| `02-monthly-31st-clamped.png` | Same panel, monthly on the 31st from 31 Jan 2027: preview shows 31 Jan, **28 Feb**, 31 Mar, **30 Apr**, 31 May (clamped to the last day in short months). |
| `03-recurring-page-rebuilt.png` | Rebuilt `/recurring` page: schedule name, document type, Customer picker (Cleancorp Ltd), multi-line items with item picker, Add line. |
| `04-not-emailed-email-not-configured.png` | Existing schedules with run history: generated runs show **"Not emailed: email not configured"**, a "Needs sending" badge, Open invoice link and Pause/End actions. |
| `e2e-api-output.txt` | API E2E: create two auto-send templates (one `whenEmailUnavailable: draft`, one `mark_sent`), `POST /api/recurring-runs/process` (claimed 2), reprocess with the same `now` (claimed 0, no duplicate invoice/run), and the posted journal for the sent invoice: Dr 1200 Accounts Receivable 115.00 / Cr 4000 Sales Revenue 100.00 / Cr 2200 GST Collected 15.00. The draft invoice correctly has no journal. |

Re-run: `PATH=<node 24 + pnpm 11> ./scripts/recurring-invoices-demo.sh`
