# Recipe: mobile screen

Follow `ledgercraft-mobile-ui` and `mobile/src/theme/tokens.ts`. This recipe is the data and evidence shape, not a second visual system.

1. Put the screen under `mobile/src/screens/<domain>/`. Navigation types stay in `mobile/src/navigation`. Keep native stack and tab headers. Do not set `tabBarStyle` backgroundColor.
2. Load and mutate through the domain service (`mobile/src/services/paymentService.ts` is the payment example) and the existing query client. Do not copy server rows into a new Zustand store for data the API already owns.
3. Use `AppPressable` when `style` is a function. Lime actions use forest text. No emoji chrome. No white text on `#9FE870`.
4. Cover loading, empty, error, and offline. Payments and quick sale refuse offline work and do not queue it. Show the server message for `PAYMENT_EXCEEDS_BALANCE` and `503 EMAIL_UNAVAILABLE` rather than a local success.
5. Invalidate the query keys the screen reads after a successful write. A balance error refetches even inside the stale time.
6. Amounts stay decimal strings from the server. Format with the shared money helper. Do not sum GST in the screen.
7. Focused test: `cd mobile && npm test -- <file>.test.tsx` on Node 20. Include loading, empty, error, and success with React Native Testing Library.
8. Evidence follows `ledgercraft-verify-ui`. Expo web is labeled Expo web. A missing emulator is `device-qa-pending` after `node scripts/agent-preflight.mjs --require-native` reports `blocked`. Do not boot a device while Maestro HOLD is on. The Mobile CI job in `ledgercraft-verify` still runs.

The payment screen entry is `mobile/src/screens/invoices/InvoiceDetailScreen.tsx`. The quick-sale entry is `mobile/src/screens/sales/SellScreen.tsx`.
