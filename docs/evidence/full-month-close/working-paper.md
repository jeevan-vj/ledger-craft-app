# Independent October 2026 month-close working paper

Frozen before reading application API/ browser report output on 7 November 2026
(Pacific/ Auckland). Version `working-paper-v2`; scenario agreed with the parent
before execution. Amounts were derived with Python Decimal and double-entry
rules, not the application's totals/ report helpers. [Machine-readable golden
figures](expected.json) retain all eleven economic journals and role balances.

## Business and opening policy

One NZD services company is GST registered from 1 October 2026, invoice basis,
monthly. The close covers 1–31 October, as at 31 October. All taxable transactions
below are standard-rated 15%, all supplier input GST is fully claimable and
business-related, and there are no other documents, interest, fees, payroll,
private use, bad debts, depreciation or FX. Eligibility is a synthetic assumption,
not a real taxpayer certification.

Opening bank 10,000 / capital 10,000 is posted **as at 30 September**, brought
forward to 1 October. It is not an October financing contribution. The bank
account's opening metadata must not create an additional economic posting.
Had the journal instead been dated 1 October, cash flow would legitimately show
opening 0/ financing 10,000; that is a different period convention and is not the
chosen case. Closing values would be the same.

## Prescribed source transactions

| Date | Source | Gross / settlement | Net / GST |
| --- | --- | ---: | ---: |
|30 Sep |Opening bank/ capital |10,000.00 |No GST |
|2 Oct |Invoice A, due 31 Oct |2,300.00 |2,000.00 / 300.00 |
|3 Oct |Invoice B, due 31 Oct |1,150.00 |1,000.00 / 150.00 |
|4 Oct |Received supplier bill, due 31 Oct |1,150.00 |1,000.00 / 150.00 |
|5 Oct |Customer receipt A |1,150.00 |Settles half A |
|6 Oct |Customer receipt B |1,150.00 |Settles all B |
|8 Oct |Supplier payment |575.00 |Settles half bill |
|9 Oct |Approved paid operating expense |230.00 |200.00 / 30.00 |
|10 Oct |Credit A against unpaid balance |230.00 |200.00 / 30.00 |
|11 Oct |Credit B against paid invoice |115.00 |100.00 / 15.00 |
|12 Oct |Refund credit B from bank |115.00 |Clears customer credit liability |

Use one operating-cost account for both cost sources when the UI permits that
choice; splitting into distinct bill/ expense cost accounts changes only the
trial-balance row grouping, never the 1,200 cost total. Parent/ platform agents
must record actual account mappings from the **static chart and chosen inputs
before reading report results**, rather than select expected values afterwards.

## Double-entry and trial balance

Opening: Dr bank 10,000 / Cr capital 10,000. Invoice A: Dr AR 2,300 / Cr sales 2,000 /
Cr outputGST 300. Invoice B: Dr AR 1,150 / Cr sales 1,000 / Cr outputGST 150. Bill:
Dr cost 1,000 / Dr inputGST 150 / Cr AP 1,150. Receipts: Dr bank 1,150 / Cr AR 1,150
for each invoice. Supplier payment: Dr AP 575 / Cr bank 575. Paid expense:
Dr cost 200 / Dr inputGST 30 / Cr bank 230. Credit A: Dr sales 200 / Dr outputGST 30 /
Cr AR 230. Credit B: Dr sales 100 / Dr outputGST 15 / Cr customer-credit liability 115.
Refund B: Dr customer-credit liability 115 / Cr bank 115.

| Account role | Debit | Credit |
| --- | ---: | ---: |
|Bank |11,380.00 |0.00 |
|Receivables |920.00 |0.00 |
|Operating costs |1,200.00 |0.00 |
|Input GST |180.00 |0.00 |
|Capital |0.00 |10,000.00 |
|Sales |0.00 |2,700.00 |
|Payables |0.00 |575.00 |
|Output GST |0.00 |405.00 |
|Customer-credit liability |0.00 |0.00 |
|**Closing trial balance** |**13,680.00** |**13,680.00** |

The eleven original economic journals each balance; their debit/ credit turnover
is 18,165.00 each. Technical statement-import/ classification/ reversal entries may
add journal rows but must have **zero net economic effect** after matching. Do
not confuse closing net trial-balance totals 13,680 with journal turnover 18,165,
or demand exactly eleven rows after technical reconciliation.

## Financial statements and control bridges

Accrual P&L: sales 3,000 − credits 300 = revenue 2,700. Costs 1,000 + 200 = 1,200.
Profit is **1,500**. Equity is capital 10,000 + profit 1,500 = **11,500**.

The canonical chart presentation has separate GST controls: assets bank 11,380 +
AR 920 + inputGST 180 = **12,480**. Liabilities AP 575 + outputGST 405 = **980**.
Thus **12,480 = 980 + 11,500**. This is the chosen expected balance-sheet grouping
when the static chart marks input GST as an asset and output GST as a liability.

For comparison, netting the same tax authority's controls shows GST payable 225,
assets 12,300 and liabilities 800: **12,300 = 800 + 11,500**. A one-control GST chart
also has a closing trial balance 13,500 per side. These are explicitly documented
chart/ presentation variants, not alternative amounts chosen from observed output.
The app must disclose its chart grouping; legal/ statutory offset presentation
requires the applicable accounting policy and is not certified by this test.

Cash:10,000 + 1,150 + 1,150 − 575 − 230 − 115 = **11,380**. The cash-flow statement
shows opening 10,000, customer receipts 2,300, refund 115, suppliers 575, expenses 230,
net operating **1,380**, financing 0, net movement 1,380 and closing 11,380.

Cash P&L revenue is net receipts (2,300 − 115)/ 1.15 = **1,900**. Paid costs are
575/ 1.15 + 230/ 1.15 = 500 + 200 = **700**. Cash profit is **1,200**. Its bridge to
operating cash is 1,200 + net cash GST 180 = 1,380. Its bridge from accrual profit is
1,500 − unreceived net sales 800 + unpaid net bill cost 500 = 1,200.

AR: A 2,300 − receipt 1,150 − credit 230 = **920**; B 1,150 − receipt 1,150 = 0, with
its subsequent credit/ refund entirely in customer-credit liability. AP:1,150 − 575
= **575**. Both are in the **current** bucket on 31 October (due that day), not
1–30 overdue. All other aging buckets and unallocated controls are 0.

## GST working paper

| Basis | Sales gross | Purchase gross | Output GST | Input GST | Net payable |
| --- | ---: | ---: | ---: | ---: | ---: |
|Invoice |3,105.00 |1,380.00 |405.00 |180.00 |**225.00** |
|Payments |2,185.00 |805.00 |285.00 |105.00 |**180.00** |
|Hybrid |3,105.00 |805.00 |405.00 |105.00 |**300.00** |

Invoice sales gross is 3,450 − 230 − 115 = 3,105; purchases 1,150 + 230 = 1,380.
Output 450 − 30 − 15 = 405; input 150 + 30 = 180.

For payments basis, credit A reduces only the **unpaid AR portion**, so does not
reduce GST already recognised on its 1,150 receipt (GST 150). B has receipt GST 150
and the actual 115 refund reverses GST 15, leaving 135. Total output 285. Supplier
payment 575 includes 75 GST; paid expense 230 includes 30. Total input 105. A paid
credit is not treated as cash leaving before its actual refund, and the credit
and refund must not both deduct the same cash GST. Hybrid uses invoice sales
and paid purchases, giving 405 − 105 = 300.

The selected invoice-basis month should prepare 225 payable. Any filing display
is preparation/ external-record functionality only; no real IRD submission is
part of this walkthrough. A synthetic filing reference must never be presented
as actual tax authority acceptance.

## Bank statement and close controls

Statement opening 10,000; lines + 1,150, + 1,150, − 575, − 230 and − 115; closing 11,380.
Match each line to its pre-existing receipt/ payment/ expense/ refund posting.
Expected unmatched count 0 and final difference 0. No arbitrary bank error,
unsupported book adjustment, duplicated revenue/ cost or artificial suspense
posting may be used just to achieve zero.

After reconciliation, every frozen report and source-document amount must remain
unchanged. Later November activity must not alter these October amounts. A
completed statement should reject unsupported/ backdated financial edits under
its actual cutoff contract; this is not a claim of a company-wide accounting
period lock.
