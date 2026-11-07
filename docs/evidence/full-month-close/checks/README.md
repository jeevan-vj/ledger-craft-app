# Verification logs

Node versions used: web/readiness22.23.4; API/contracts/Worker24.22.1;
mobile20.20.2 (mobile logs are alongside the mobile evidence).
All final green checks exited0; red regression runs exited1 for the stated defect.
No warning ceiling, test assertion or release gate was relaxed.

| Regression | Before fix | After fix |
| --- | --- | --- |
| Cash-flow technical double gross | `cashflow-red.log`; API `../api/cashflow-red.log` | API full600 and `../api/verification.log` |
| Cash-flow view shows account net movement | `cashflow-web-red.log` | `cashflow-web-green.log`; web full870 |
| Auckland calendar receipt date | `payment-date-red.log` (`TZ=Pacific/Auckland`) | `payment-date-green.log`; full built-web UI receipt payloads |
| Closing trial-balance export columns | `tb-export-red.log` | `tb-export-green.log`; contracts full162; six real export downloads |
| Web closing trial-balance totals | `web-tb-red.log` | `web-tb-green.log`; full web870; independent13680 closing sides |
| Hono conversation API default | `conversation-red.log` | `conversation-green.log`, `conversation-regression.log`; full web870 |
| Refund match and persisted count | `../api/refund-match-red.log`; acceptance red before corrections | `../api/verification.log`, `../api/evidence-enhancement-verification.log`; real five-line UI bank closes |

`api-all.log.gz` preserves complete API output. `archive-integrity.json` records
its uncompressed SHA-256. `api-all-summary.log` provides the final135files/600tests
summary. Other final logs retain all errors/warnings. Color control codes and
trailing whitespace are removed only from readable text copies.

The web UI logs name eight phases and require a successful exit for each.
Expected pre-onboarding HTTP401/404 diagnostics are retained in web/results.json;
all unexpected browser page/console errors fail the driver.
