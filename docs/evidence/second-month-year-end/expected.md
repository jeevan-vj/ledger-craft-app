# Independent second-month and year-end working paper

Frozen 8 November 2026 before reading current production report code, API responses or browser results. The calculations use Python Decimal and the prescribed economic journals, starting from the previously frozen October working paper. No production totals helper is used.

The machine-readable paper is [expected.json](expected.json), SHA-256 `44569ca2371a1e2495eb966f1f7a6f400dde48b805d865aa56aabca80b9f409e`. Its opening source is the merged [October paper](../full-month-close/expected.json), SHA-256 `c581c7343a971e4844971a5885d601a4c70308fc66ed423e53f9e388a05b3739`. All money is NZD, exact decimal text. The financial year starts April 1. Registered GST basis is invoice, monthly.

## November business case

Start with the actual October books: cash11,380; invoice A receivable920; invoice B settled; supplier bill payable575; input GST180; output GST405; accumulated revenue2,700; costs1,200; capital10,000. October is closed. Do not post a new opening journal or new capital contribution.

| Date | Business operation | Exact economic posting |
| --- | --- | --- |
| Nov2 | Collect October invoice A's remaining920 | Dr bank920 / Cr receivables920 |
| Nov3 | Pay October supplier's remaining575 | Dr payables575 / Cr bank575 |
| Nov4 | Invoice C, net1,000 + GST150, dueNov30 | Dr receivables1,150 / Cr sales1,000 / Cr output GST150 |
| Nov5 | Receive half of invoice C,575 | Dr bank575 / Cr receivables575 |
| Nov6 | Credit C's unpaid balance, net100 + GST15 | Dr sales100 / Dr output GST15 / Cr receivables115 |
| Nov7 | Receive new supplier bill, net400 + GST60, dueNov30 | Dr costs400 / Dr input GST60 / Cr payables460 |
| Nov8 | Pay half of the new supplier bill,230 | Dr payables230 / Cr bank230 |
| Nov8 | Paid expense, gross115 including GST15 | Dr costs100 / Dr input GST15 / Cr bank115 |

There are **five** November bank statement movements, not eight: +920, −575, +575, −230 and −115. Match them to these existing sources. Inflows1,495 − outflows920 =575, giving closing cash11,955. No adjustment or duplicate income/expense is allowed to force reconciliation.

| Expected control at Nov30 | Amount |
| --- | --- |
| Trial balance, debits and credits each | 14,370 |
| Assets | 11,955 bank +460 receivables +255 input GST =12,670 |
| Liabilities | 230 payables +540 output GST =770 |
| Equity | 10,000 capital +1,900 accumulated profit =11,900 |
| November accrual P&L | 900 revenue −500 costs =400 profit |
| Financial-year P&L to November | 3,600 revenue −1,700 costs =1,900 profit |
| November cash P&L | 1,300 revenue −800 costs =500 profit |
| AR / AP aging | 460 /230, all current at Nov30 |
| Invoice GST | 135 output −75 input =60 payable |
| Payments GST | 195 output −120 input =75 payable |
| Hybrid GST | 135 output −120 input =15 payable |

November cash revenue is800 from October A's final payment plus500 from C's half payment. Cash costs are500 from October's final bill payment,200 from the new bill's half payment and100 from the paid expense. Payment-basis GST follows those components:120+75 output and75+30+15 input. The unpaid credit C reduces AR and invoice-basis output GST; it does not create a cash receipt or refund.

The eight economic journals total4,140 debits and credits each. If the existing import/match approach retains both technical legs, its extra turnover is4,830 each side, so period turnover is8,970. Technical legs must net to zero. Raw closing nominal balances remain sales3,600 and costs1,700 because no nominal-account closing journal has been prescribed.

## March31 financial-year close

There are no economic transactions from December1 through March31. March31 therefore retains November's cash, trial balance and balance sheet. Full-year accrual profit is1,900; cash profit is1,700. The460 AR and230 AP are both over90days overdue (121days after Nov30), not current.

Closing the period to March31 does not settle the receivable/payable and does not inherently post a profit-transfer journal. A company may close with legitimate outstanding balances. The controlled clock for the acceptance run is May1,2027, so both month/year cutoffs are in the past. The production future-cutoff guard must stay intact.

## April opening and new-year operations

April1 opens with March31's balances automatically. A new opening journal would duplicate the books and is prohibited by this paper. Enter invoice D net200 + GST30 and receive230 in full on April1. Receive an April supplier bill net100 + GST15, dueApril30, leaving it unpaid. No new settlement of November's outstanding documents is prescribed.

| Expected control at April30 | Amount |
| --- | --- |
| Raw closing trial balance, each side | 14,715 |
| Assets | 12,185 bank +460 old receivable +270 input GST =12,915 |
| Liabilities | 345 payables +570 output GST =915 |
| Equity | 10,000 capital +1,900 prior-year earnings +100 current-year profit =12,000 |
| April accrual P&L | 200 revenue −100 costs =100 profit |
| April cash P&L | 200 revenue −0 costs =200 profit |
| Cash flow | 11,955 opening +230 receipts −0 payments =12,185 closing |
| AR aging | 460 over90days |
| AP aging | 230 over90days +115 current =345 |
| April invoice GST | 30 output −15 input =15 payable |
| April payments / hybrid GST | 30 output −0 input =30 payable |

Raw nominal-account balances become sales3,800 and costs1,800. A correct report can present retained earnings1,900 and current earnings100 separately, or an accurately labelled aggregate accumulated-earnings line2,000. It cannot count either part twice, discard the prior1,900, or include that prior profit in April's P&L. This paper does not require an automatic persisted closing journal. If a product does post a closing journal, its balanced, scoped, idempotent transfer and raw-ledger effect require separate explicit verification.

Comparatives must show FY2026/27 profit1,900 and FY2027/28 profit100; calendar Q4-2026 profit1,900, Q1-2027 zero and Q2-2027 profit100. October/November/monthly and quarter details are frozen in the JSON. Empty December–March periods must remain visible with zeros when comparative columns request them.

## Historical and acceptance controls

After November settles October's outstanding documents, an October31 report must still show AR920/AP575 and its original P&L, TB, cash and GST. Historical aging must reconstruct settlement/credit dates, not use today's document balance. After April, the November30 reports and its retained GST/reconciliation must remain unchanged as well.

Only fiscal-period metadata should change when closing/reopening: economic journals and all seven financial sections stay unchanged. A reopened fiscal period must still respect any independent completed bank statement cutoff. Do not alter or recreate historical source documents to make report comparisons pass.

The prescribed case covers partial settlements, a credit against an unpaid balance and the October paid-invoice refund carried forward from the opening scenario. It contains no new overpayment or November refund. Any supplementary economic case must have its expectations frozen before execution; a rejected overpayment/retry guard can be tested without adding economic activity.
