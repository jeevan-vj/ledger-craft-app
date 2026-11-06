# Tax preparation and credit-note acceptance worksheet

This is local HTTP/SQLite acceptance evidence for the accounting-completion
change. Values below are independently expected amounts, asserted through real
Hono routes and migrated temporary SQLite. They are not mocked ledger results.

## Reference tax cases

The reference company has net consulting sales1,400/GST210, taxable expenses200/
GST30, exempt costs50, and a received supplier bill300/GST45. Receipts are1,150
and230; the supplier payment is69 of345. The posted accounting profit is850.

| Case | Independently expected NZD |
| --- | --- |
| Invoice-basis GST | Gross sales1,610; purchases625; output210; input75; payable135 |
| Payments-basis GST | Receipts1,380; paid purchases349; output180; input39; payable141 |
| Reviewed external adjustment | Output−15 with gross sales−115; input+3; final gross sales1,495; output195; input78; payable117 |
| Company-tax worksheet | Profit850 +addbacks100 −deductions50 =900; eligible brought-forward losses200 → taxable700; explicitly confirmed28% =196; credits50 → payable146 |
| Loss/credit boundaries | Brought-forward losses1,000 against adjusted profit900 → taxable0, unused losses100, excess credits50; adjusted loss250 plus brought-forward200 → losses carried450, tax0 |

Reasons and source references are mandatory for manual adjustments. The saved
review/preparation actor and timestamp are bound to the authenticated saver,
not trusted from client metadata. Saving/reloading retains the exact strings,
adjustment reasons, references, selected basis and source figures. An optional
`Idempotency-Key` on tax-draft creation replays the original response and rejects
a changed body with409; callers omitting it remain supported. Submitted/filed
records reject edits, resets to draft and deletion with409; filing references
and preparation metadata remain intact.

These are draft worksheets. No IRD return was submitted. The company worksheet
requires explicit standard NZ-company eligibility and confirmation of28%; it is
not a complete IR4, tax assessment, provisional-tax schedule or special-entity
calculator. Eligibility of losses/credits and current legislation require
accountant confirmation. The managed network does not allow a live IRD policy
lookup; no current-law verification is claimed.

## Foreign document conversion

A USD115 invoice and USD115 approved expense plus USD345 received bill, at the
reviewed source rate1.6, produce NZD gross sales184/purchases736 and GST24/96,
net refundable72. Half the invoice is received and69 of the bill paid at a later
rate1.7. The payments preparation allocates the original document-rate GST and
carrying amounts: gross sales92/purchases294.40, GST12/38.40, net refundable26.40.

Invoice-basis GST includes already-converted base journal amounts exactly once.
Legacy foreign source postings that disagree with reviewed base snapshots stay
excluded with an audit warning. Missing foreign settlement snapshots are also
excluded and warned. Foreign payments preparation requires explicit review and
states its **document carrying-rate** policy; exchange gains/losses do not become
GST. Confirm that conversion method with the accountant for the registration.
A different permitted tax conversion method needs a documented adjustment.

## Real credit-note lifecycle

| Case | Independently expected NZD |
| --- | --- |
| Unpaid invoice1,150, issue credit230 | Original invoice total remains1,150; totalCredited230; AR920; revenue800; outputGST120; cash0 |
| Receive remaining920 | AR0; cash920; invoice settled with credits, not a1,150 cash receipt |
| Fully paid1,150, issue credit230 | AR0; Customer Credits liability230; cash still1,150; revenue800; outputGST120 |
| Refund customer230 | Liability0; cash920; payments-basis outputGST120; journals and balance sheet balance |
| Reverse refund, then credit note | Original revenue1,000/outputGST150/cash1,150 restored; original source, credit and refund journals retained |
| USDcredit23, original rate1.6, refund rate1.75 | Liability carrying36.80; bank refund40.25; realized FX loss3.45; remaining foreign cash143.75; payments GST19.20 |
| USDsource0.03 at1.5 | Base0.05; three credits0.01 allocate base0.02/0.01/0.02, conserving0.05 |
| Mixed cash/credit foreign cents | Cash0.01 +credit0.01 +cash0.01 clears original0.03/base0.05 without a residual cent |
| GST rounding boundary | Inclusive invoice0.10/GST0.01, credit0.05/GST0.01, receipt0.05 → payments GST0.00, not0.01 |

Dated receivable-credit budget events preserve earlier periods. A receipt0.05
with allocated GST0.01 in April stays0.01 when queried later. A May credit that
consumes that tax records the−0.01 rounding movement in May, and June reversal
restores+0.01 in June. Negative source components require explicit preparation
review; a normal net refund alone is allowed.

Issue/refund creation requires the existing organization/user-scoped idempotency
key mechanism. Replays do not post another journal. Concurrent credits cannot
exceed remaining source gross, net or GST. Refunds are bounded by the customer
liability, not the entire credit note. Source draft/cancelled documents and
non-proportional mixed-tax credits are rejected. Original-payment reversal and
source cancellation require reversing active credits/refunds first. Backdated
credits cannot predate recorded payments or earlier issued credits. Foreign
credit/refund movements respect reviewed revaluation closing dates.

The first supported source-credit policy is standard/zero-rated or proportional
invoice credits within cent precision. Non-proportional mixed-tax credits need
an accountant workflow; the API rejects them rather than producing a false
payments-basis return. Manual return-only adjustments must not duplicate credit
notes already posted by this module.

## Reproduction

Use Node24 and the repository-pinned pnpm. No production data or credentials are
required. Migration0027 is additive; existing migrations and posted entries are
not rewritten.

```sh
pnpm --filter @ledgercraft/api exec vitest run \
  src/modules/tax/tax-completion.e2e.test.ts \
  src/modules/tax/gst-payments.test.ts \
  src/modules/tax/gst-preparation.test.ts \
  src/modules/tax/gst-ird-scenario.e2e.test.ts \
  src/modules/tax/tax.test.ts \
  src/modules/credit-notes/credit-notes.test.ts
pnpm --filter @ledgercraft/api type-check
pnpm test:contracts
pnpm --filter @ledgercraft/contracts type-check
```

The earlier credit-note capability skip was replaced by a real posted credit
and reversal scenario. Native-device execution and live IRD/provider operations
are separate gates; browser and integration tests do not certify those gates.
