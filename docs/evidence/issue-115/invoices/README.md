# Invoice GST compliance evidence

Actual Chromium verification against built web preview `6489cf661d77` and real Hono/SQLite API, 6 November 2026. Desktop viewport 1440×900; phone viewport 390×844. Run: `node scripts/issue-115-invoice-compliance-proof.mjs` (API3001/web8080). See `results.json` and `browser-green.log`; zero browser page errors.

| Scenario | Expected | Actual |
| --- | --- | --- |
| Registered NZ company, registration effective before invoice date | Tax invoice, GST number and buyer identifier in every template | All six templates passed; screenshots 01–06 |
| GST-inclusive NZ$1,150 | Net $1,000 + GST $150 = total $1,150 | Public pages and downloaded PDF matched |
| Registered phone public invoice | Same identity and amounts | Screenshot 07 |
| Buyer with no identifier, inclusive total exactly $1,000 | Save permitted; net $869.57 + GST $130.43 | Actual phone edit/save returned HTTP200; screenshot 08 |
| Same buyer, total $1,000.01 | Clear buyer fix-it; API rejects save | Actual phone line-item drawer edit showed alert/link; API422 GST_BUYER_DETAILS_REQUIRED; original $1,000 retained; screenshot 09 |
| Not registered | Invoice title; no GST number or GST tax line | Screenshot 10 |
| Profile subsequently changed | Original public snapshot retains original registered seller identity | Passed |

`registered-tax-invoice.pdf` is the actual downloaded document. Its first page was rendered and visually reviewed (`registered-tax-invoice-pdf-page.png`): legible seller GST number, buyer phone, dates and reconciled GST amounts.

Additional automated regression checks cover API create/update/send/share, tenant scoping, legacy registration review, pre-registration issuance, immutable public buyer identifiers, and foreign-currency thresholds using reviewed NZD base totals. Targeted invoice API suites passed 20 tests. Affected web invoice/onboarding/adapter/preview suites passed 108 tests; the final explicit-line-tax regression passed separately. Strict app/API TypeScript passed. Scoped lint had zero errors and nine existing warnings. Repository-wide final checks are recorded by the parent issue review.

These screenshots exercise responsive web, not an installed native app. Native/mobile evidence is recorded separately in the sibling mobile directory. No email delivery, payment acceptance or IRD submission is claimed by this document run.
