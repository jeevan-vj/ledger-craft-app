# Expo customer statements and reminder management

Implemented locally7 November2026 (Pacific/Auckland). This extends issue110 to
mobile under the user's broader web/mobile request. The issue's original scope
excluded mobile, but the user's instruction takes precedence.

## Features

- Customer statement workspace supports customer selection, activity/open-item
  mode, reviewed date ranges, canonical opening/running/closing balances, aging,
  source warnings and empty/error/retry states.
- PDF export reads server decimal strings. Native uses existing Expo Print and
  Sharing; Expo web uses the existing pure-JavaScript jsPDF dependency and
  creates an actual downloadable PDF. No native module or runtime-version
  change is introduced.
- Owner/admin/accountant actions create/revoke expiring secure snapshot links,
  invoke native sharing or show a selectable link, and send single/bulk emails
  only when the shared server capability confirms availability. Failed
  capability loading is distinguished from an unconfigured provider.
- Single and bulk sends retain stable idempotency keys across retries. Changing
  bulk selections cannot alter a single-send retry key. A failed or uncertain
  send never displays success without a confirmed `sent:true` response.
- Reminder settings expose enable/disable, timezone, local time, offsets, tones,
  optional subject/message templates, explicit review and server validation.
  Owner/admin changes require `settings.write`. Readers retain the saved view.
- Customer/invoice opt-outs require `banking.write`. Invoice detail's reusable
  panel shows step, scheduled date, sent time/status/reason and an honest warning
  for uncertain delivery. TanStack Query owns server state and follows the
  existing company-switch cache clearing behavior.

Shared navigation integration, customer-detail statement buttons and invoice
panel mounting are parent-owned. Screens use native primitives, existing
semantic theme tokens, automatic content insets and measured tab clearance.

## Test-first verification

Initial tests failed before the new API/UI modules existed. Separate red tests
caught two retry/capability regressions: bulk selection changed a single-send
key, and a capability-fetch error was incorrectly displayed as email being
unconfigured. Both are corrected and protected by passing component tests.

Node20.20.2, from `mobile/`:

```sh
npm test -- --ci --watchAll=false --runInBand src/features/customer-statements
npx tsc --noEmit --pretty false
npx eslint src/features/customer-statements src/screens/customerStatements
```

Focused result: **3 suites /12 tests passed**, TypeScript exit0, scoped ESLint
exit0 with0 errors/0 warnings. Native PDF tests assert exact canonical balances,
HTML escaping, generated-file sharing and unavailable-share behavior. Component
tests cover loading, empty, error, success, role restrictions, settings review,
invoice opt-out and retry identity. Parent verification records the complete
mobile suite and production export after all mobile changes are frozen.

## Browser and device acceptance

The real API/Expo browser proof is
`scripts/issue115-mobile-collections-proof.mjs`. It creates a synthetic company,
posts a September1,000 invoice and October400 receipt, expects October opening
1,000/closing600, downloads an actual PDF, checks secure snapshot sharing,
persists customer/invoice opt-outs and saves reviewed reminder settings.
Final actual browser execution passed against the shared frozen Hono/SQLite
API and Expo app at390×844. Five PNGs, an actual PDF plus extracted text, and
`results.json` are attached. Expected opening1,000/payment400/closing600 all
match the UI, API and PDF text. Secure snapshot sharing retains600; customer and
invoice opt-outs persist; reviewed reminders save enabled/10:30/Pacific-Auckland
with email correctly unavailable. No page errors were accepted. Visual review
covered the canonical balances, wrapped secure link, schedule and invoice
history/preferences.

Two earlier driver attempts completed the first four states but used an exact
invoice-number locator or selected an inactive Home tab duplicate underneath
the active Invoices tab. The final driver uses the supported invoice deep link
to exercise the actual new invoice-detail panel. No application assertion or
production code was weakened; those driver failures are retained separately,
and their failure screenshots are excluded from the final evidence. Initial
Metro compilation was allowed to finish without restarting shared services.

**Device checks pending:** installed iOS/Android keyboard and Dynamic Type,
Print/share sheets and cancellation, file-provider behavior, back gestures and
background/resume. Expo web screenshots cannot establish those checks. No real
provider message, deployment or signed native release is claimed.
