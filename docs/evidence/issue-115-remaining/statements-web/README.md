# Customer statements and reminders — actual web verification

Real local Hono/SQLite, production buildb6264eb0537c, Chromium1440×900 and390×844.
The driver signs up synthetic registered companies and opens the customer list,
statement preview, downloaded PDF, anonymous retained link, reminder settings and
invoice opt-out. No mocked session or real email provider is used.

Expected/actual: opening230 + invoices1150 − receipt575 − credit115 =690.
Aging current460 +31–60days230 =690. After a late receipt115 the current books
show575, while the original public snapshot and PDF retain690. The anonymous
page applies no-referrer. Settings save/reload enabled reminders with honest
email-unavailable status; invoice opt-out persists.

Ten actual screenshots, two PDFs, results and the passing browser log are here.
The controlled checkbox waits for the acknowledged server state; an earlier
Playwright check() asserted before asynchronous save/refetch completed. Signup
backoff respects the existing3-per10-second limit. Nothing weakened application
guards or changed money to obtain a pass.

Reproduce: `node scripts/issue115-statements-proof.mjs` with the local API and
production preview running. Provider delivery, deployed acceptance and native
sheets remain separate.
