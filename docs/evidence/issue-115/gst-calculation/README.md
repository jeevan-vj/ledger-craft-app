# Authoritative GST calculation and saved-return evidence

Verified locally on 7 November 2026 (Pacific/Auckland), using actual Hono routes,
organisation membership and temporary SQLite. These are synthetic records, not
production books or an IRD submission.

## Independent working paper

Sales: net1,000 + GST150 =1,150, with575 received. Approved expense:200 + GST30
=230. Received bill:300 + GST45 =345, with69 paid. Registration is explicitly
confirmed for a NZ business from1 April2026, with monthly periods. The supplier
payment includes9 GST; the customer receipt includes75 GST.

| Saved basis | Sales gross | Purchases operational /claimable gross | Output /input GST | Net GST |
| --- | ---: | ---: | ---: | ---: |
| Invoice |1,150.00 |575.00 |150.00 /75.00 |75.00 |
| Payments |575.00 |299.00 |75.00 /39.00 |36.00 |
| Hybrid (invoice sales /paid purchases) |1,150.00 |299.00 |150.00 /39.00 |111.00 |

Each expected number matches the actual preparation and saved draft. Capture
files contain the full server-owned calculation and source snapshot:
[invoice](invoice.json), [payments](payments.json), [hybrid](hybrid.json).
The snapshots contain only source IDs, dates and financial facts; they contain
no session cookie, provider key, document description or customer contact data.
Prior financial history is retained because payments-basis allocation needs
source and settlement history, not just current-period cash rows.

## Server contract and trust boundary

- Version `gst-ledger-v2`, stable SHA256 fingerprint, calculation time, settings,
  exact figures, financial sources, IDs/counts and named myIR boxes are returned
  by the authenticated preparation endpoint.
- The fingerprint excludes volatile calculation/review timestamps. Repeated
  reads of unchanged books agree; every GST return create recomputes inside the
  same organisation transaction as the write. Client totals are assertions and
  cannot override the server figures. Client-supplied snapshots are checked
  against the canonical source content and are never trusted as calculations.
- Known GST-eligible gross supports the box formula. Operational purchases are
  not automatically box11: exempt/nonclaimable costs must be excluded by source
  classification. Missing eligible gross omits boxes11–13 and blocks filing.
- Unknown or stale zero-rated/exempt sales classification omits boxes5–9; no
  fictional balancing GST adjustment is invented. The output/input ledger GST
  and net position remain visible with explicit review warnings. A source-backed
  classification must account for the entire known untaxed sales amount.
- Boxes8/12 use classified GST-inclusive gross ×3/23; boxes9/13 disclose the
  exact difference to the actual source/reviewed GST, preserving source rounding
  and explicit supported adjustments. Mapping provenance and legal limits are
  in [the mapping review](../gst-mapping-review.md).

## Lifecycle and permissions verified

1. An unconfigured client POST containing invented sales9,999/GST1,304.22 used to
   be saved201; it now fails422 before a return is created.
2. Invoice, payments and hybrid settings produce the independent figures above,
   stable fingerprints and saved source IDs/counts. Amount or box tampering is422.
3. A subsequent approved receipt with GST15 changes the current result from75
   to60. The recorded filed return remains75 with its original JSON unchanged;
   readonly recalculation shows−15. A stale preparation cannot be saved.
4. Current basis changes do not rewrite an old record. Readonly comparison uses
   the original recorded settings and separately reports settingsChanged:true.
5. Saved canonical drafts cannot be overwritten or deleted. Identical PATCH is
   a no-op returning the original snapshot; a changed calculation requires a
   new draft. New revisions preserve the old record. Overlapping filed periods
   cannot be created or recorded again. Filing a future period returns422.
6. If an original500 zero-rated review becomes stale after another250 untaxed
   sale, comparison still returns current books, requires a fresh classification
   and omits unsupported sales boxes. It never changes the recorded draft.
7. Real HTTP tests change the stored membership to member/read_only. Reads and
   readonly comparisons remain available; settings, return creation, mutation
   and filing return403. Another organisation receives404 for the return.

## Test-first and acceptance results

The original arbitrary-client-total bug was reproduced before implementation:
[red](client-override-red.log). New immutable-draft deletion and future-filing
failures were captured before those guards: [red](lifecycle-red.log). The stale
classification comparison initially returned422; after the trusted internal
comparison option it returns a safe readonly result: [red](stale-classification-red.log).

Final scoped verification under Node24.22.1/pnpm11.19.0:

```sh
pnpm --filter @ledgercraft/api exec vitest run src/modules/tax/gst-calculation.test.ts
pnpm --filter @ledgercraft/contracts exec vitest run src/gst-calculation.test.ts
pnpm --filter @ledgercraft/api type-check
```

Actual results: **10 API tests passed**, **1 contract test passed**, strict API
TypeScript exit0; scoped ESLint0 errors/0 warnings. [API log](canonical-api-green.log).
The JSON artifact rerun selects the three basis cases; it does not claim another
unique set of tests.

## Existing fixture migration

Old tax tests had unconfirmed registration metadata and some posted quarterly
or arbitrary browser totals. They now use a valid synthetic GST number and
explicit saved basis/frequency/anchor. Existing multi-month date windows become
legitimate registration first-stub periods with a six-monthly anchor; existing
transaction dates and monetary expectations remain unchanged. The prior-period
31 March taxable-sale case registers from1 January, retaining its original15 GST.
The tax route test now posts real1,150 sales/230 purchases and still asserts120
GST, using the canonical source field instead of a browser-supplied aggregate.
Basis comparisons explicitly change the persisted settings; query parameters
cannot silently override registration.

Those seven pre-existing tax files retain all 24 tests and their financial/lifecycle assertions:
23 passed on the first configured run, and the remaining prior-registration
fixture passed after its registration date was corrected; the final original
IRD scenario has8 passing cases. No test was skipped or loosened to accept a
wrong financial result. Parent verification records the final combined suite.

## Boundaries

This is reviewed preparation and a manual filing record, not an automatic myIR
submission or current-law certification. Unknown classifications cannot be
silently converted into zero-rated supplies or GST credits. Filed and saved
canonical source snapshots remain fixed; corrections require a separate review.
No organisation-wide fiscal-period lock or live provider/native-device claim is
introduced here.
