# Issue #88: quick-sale completion

Local verification on 6 November 2026. The mobile evidence is **Expo web in
Chromium at 390 × 844**, connected to the real local Hono API and SQLite. It is
not signed iOS or Android device verification. No deployment, OTA update, or
GitHub issue closure was performed.

The existing transactional sale and summary APIs are retained. Mobile now has
receipt QR/native Share/Done actions, device favourites and tile ordering, a
business-timezone day summary with date selection and invoice navigation, and
walk-in-tag invoice filters. QR links are created lazily and reused. Leaving
during link creation cannot open an old share sheet. A long press no longer
swallows the next normal tile tap. Shared web and mobile invoices visibly show
Paid only when their saved snapshot is paid.

Expo web also needs localStorage for quick-sale persistence, the Expo Babel
`import.meta` transform, class dark mode, and Tailwind preflight disabled so its
button reset cannot erase React Native Web button backgrounds. The QR encoder
is pure JavaScript (`qrcode-generator`); no native QR module was added.

## Verification

| Check | Runtime | Result |
| --- | --- | --- |
| API tests | Node 24.22.1 | 74 suites, 336 passed, 1 skipped |
| Contract tests | Node 24.22.1 | 27 suites, 119 passed |
| API and contract typechecks | Node 24.22.1 | Passed |
| Web unit tests | Node 22.23.4 | 110 suites, 665 passed |
| Web lint | Node 22.23.4 | 460 errors / 116 warnings; existing 468-error gate passed |
| Web typecheck | Node 22.23.4 | 649 existing app errors; Node config clean; 728-error gate passed |
| Full web build, prebuild and postbuild verifier | Node 22.23.4 | Passed; generated tracked version file restored |
| Release checker tests / source-map checker / parity report | Node 22.23.4 | Passed; parity report retains documented deferred scope |
| Mobile Jest | Node 20.20.2 | 91 suites, 456 passed; exit 0 |
| Mobile ESLint / TypeScript | Node 20.20.2 | 0 lint errors (75 warnings); typecheck passed |
| Production iOS / Android / web exports | Node 20.20.2 | All passed |
| Authenticated mobile browser walkthrough | Chromium | Passed; zero uncaught browser errors |
| Receipt QR screenshot decode | jsQR | Exact public invoice URL verified |

The mobile runner reports existing query-cache timer teardown warnings. A
diagnostic run traced those timers to payment-query test fixtures; no assertion
was disabled. The final complete run used two Jest workers and exited 0.

The browser flow exercises the Quick sale switch, saved favourites and cart
after reload, $13.50 cash charge with $20 tendered and $6.50 change, receipt and
anonymous paid invoice, $1.76 GST, summary date selection, invoice detail/back,
Sales/Regular invoices filters, and offline Charge blocking. It then commits a
$4.50 card sale while intentionally dropping the response, retries with the
same key, and verifies only one additional sale: $18.00 gross, $2.35 GST.
Only the dropped network response is simulated; sale persistence and replay
use the real API. See [result.json](result.json).

Run the proof with the local API on 3001, Vite on 8080, and Expo web on 8081:

```bash
# From mobile/, in a separate shell:
EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:3001 \
EXPO_PUBLIC_APP_ORIGIN=http://127.0.0.1:8081 \
EXPO_PUBLIC_WEB_URL=http://127.0.0.1:8080 npx expo start --web --port 8081

# From the repository root:
node scripts/quick-sale-mobile-screens.mjs
```

The proof requires Chromium at `/usr/bin/chromium` (`CHROMIUM_PATH` overrides
it), creates isolated local test accounts and sales, and saves artifacts under
`/tmp/ledgercraft-quick-sale` (`QUICK_SALE_OUTPUT_DIR` overrides it). The API and
mobile URLs can be overridden with `QUICK_SALE_API_URL` and
`QUICK_SALE_MOBILE_URL`; the script accepts local hosts only.

## Screenshots

- [Sell and favourites](01-sell.png)
- [Cash charge and change](02-charge.png)
- [Receipt QR](03-receipt.png)
- [Public paid invoice, phone](04-buyer-paid-invoice.png) and [desktop](04-buyer-paid-invoice-1440.png)
- [Day summary](05-day-summary.png) and [empty past date](06-empty-past-day.png)
- [Paid invoice detail](07-sale-invoice.png) and [Sales filter](07-sales-filter.png)
- [Offline cart](08-offline-cart.png)

## Remaining gates

Signed **iOS and Android** checks remain: scan the QR on a second device, invoke
and dismiss native sharing, background/relaunch with a saved cart, test offline
reconnect, long-press quantity editing, navigation Back, keyboard and safe-area
layout. Jest mocks native sharing; browser screenshots do not prove native
share sheets. These signed-device acceptance criteria prevent claiming the
entire issue is ready to close.

The invoice source filter deliberately follows the issue's walk-in-tag rule.
A quick sale attached to a named customer still appears in the day summary and
all invoices, but falls under Regular invoices in this filter. Cash ledger
routing, refunds, printers and offline queues remain outside v1 as approved.
