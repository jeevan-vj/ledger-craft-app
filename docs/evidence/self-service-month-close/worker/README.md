# Actual Cloudflare Worker acceptance

**PASS: real local Miniflare/workerd, Identity and per-company Ledger Durable Objects.**
Controller Node22.23.4; compatibility date2026-09-11 with nodejs_compat. No runtime
API is mocked. Nothing is deployed and no provider/IRD operation is performed.

This is a **supplementary minimal fixture**, not the full October walkthrough:
opening bank/capital10,000; one approved October expense230 including GST30.
Two reviewed nonbank adjustments100 each cancel after reopening, preserving the
reference balances. Expected closing cash9,770, profit−200, input GST30, net GST−30,
closing TB10,000 each side, assets/equity9,800 and no receivable/payable balance.

The executable [Worker proof](../../../../scripts/self-service-worker-close.test.mjs)
checks actual signup, bank-ledger preparation/retry without posting opening money,
chart classifications and opening journal; expense/import/match and completed bank
statement; retained GST draft; fiscal close, blocked backdated expense/journal and
rollback; wrong-company-header rejection; reviewed reopen, allowed nonbank journals,
reclose, lost-response retry and exactly three retained actor/reason audit events.
It downloads the binary ZIP after closing, validates14members and13SHA256checksums,
checks canonical financial/GST/bank values, then switches to another company to
prove empty financial data and a separate unset cutoff. Switching back preserves
revision3 and the original cutoff.

[Results](results.json) retain exact figures, audit events, manifest and HTTP statuses
without credentials or session headers. The [actual ZIP](supplementary-worker-close.zip)
and [manifest](manifest.json) have also been independently checked with Python zipfile
and SHA256. The GST record is a draft; refund30 is preparation, not an IRD filing.

## Real Worker failure and correction

The first actual Worker boot returned503 at signup: Durable Object SQL rejected
0035's trailing Drizzle breakpoint metadata with `SQL code did not contain a statement`.
The [red log](worker-close-red.log) records the failure. An isolated actual Durable
Object [probe](migration-probe.log) identifies0035 after35successful migrations;
removing only `--> statement-breakpoint` metadata at execution allows all37SQL
files, including0036, to execute. The period-lock specialist added a tested runner
helper; original migration SQL/checksums remain unchanged. The complete Worker proof
then passed with the normal production runner, not the diagnostic probe.

| Command | Node | Exit / actual result |
| --- | --- | --- |
| `node --test scripts/self-service-worker-close.test.mjs` before runner fix | 22.23.4 | 1; signup503 at0035 migration |
| Same command after runner fix | 22.23.4 | 0;1test, all assertions pass |
| `pnpm exec tsc --noEmit -p deploy/api/tsconfig.json` | 24.22.1 | 0;no diagnostics |
| `pnpm exec wrangler deploy --dry-run --config deploy/api/wrangler.jsonc --outdir /tmp/self-service-worker-bundle-final` | 24.22.1 | 0;dry-run completed, no deployment |

Proxy and Wrangler warnings remain visible in the sanitized readable logs. This
supplements Node API and browser/Expo proof; it is not installed native-device QA.
