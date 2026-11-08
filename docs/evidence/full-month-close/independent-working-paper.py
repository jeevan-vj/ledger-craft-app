from decimal import Decimal as D
from pathlib import Path
import json
m=lambda x:f'{D(x):.2f}'
J=[]
def journal(date,reference,lines):
    debit=sum((D(v[1]) for v in lines),D(0));credit=sum((D(v[2]) for v in lines),D(0));assert debit==credit
    J.append({'date':date,'reference':reference,'debits':m(debit),'credits':m(credit),'lines':[{'accountRole':a,'debit':m(d),'credit':m(c)} for a,d,c in lines]})
journal('2026-09-30','Opening capital',[('bank','10000','0'),('capital','0','10000')])
journal('2026-10-02','Invoice A',[('receivables','2300','0'),('sales','0','2000'),('outputGst','0','300')])
journal('2026-10-03','Invoice B',[('receivables','1150','0'),('sales','0','1000'),('outputGst','0','150')])
journal('2026-10-04','Supplier bill',[('operatingCosts','1000','0'),('inputGst','150','0'),('payables','0','1150')])
journal('2026-10-05','Receipt A',[('bank','1150','0'),('receivables','0','1150')])
journal('2026-10-06','Receipt B',[('bank','1150','0'),('receivables','0','1150')])
journal('2026-10-08','Supplier payment',[('payables','575','0'),('bank','0','575')])
journal('2026-10-09','Paid expense',[('operatingCosts','200','0'),('inputGst','30','0'),('bank','0','230')])
journal('2026-10-10','Credit A against unpaid balance',[('sales','200','0'),('outputGst','30','0'),('receivables','0','230')])
journal('2026-10-11','Credit B against paid invoice',[('sales','100','0'),('outputGst','15','0'),('customerCredit','0','115')])
journal('2026-10-12','Refund credit B',[('customerCredit','115','0'),('bank','0','115')])
balances={}
for entry in J:
 for line in entry['lines']:
  a=line['accountRole'];balances[a]=balances.get(a,D(0))+D(line['debit'])-D(line['credit'])
tb=[{'accountRole':a,'debit':m(max(v,D(0))),'credit':m(max(-v,D(0)))} for a,v in balances.items()]
tbd=sum(D(r['debit']) for r in tb);tbc=sum(D(r['credit']) for r in tb);assert tbd==tbc==D('13680')
expected={'frozenAt':'2026-11-07','method':'Independent Python Decimal, prescribed transactions only; no production totals helpers, API responses or browser lookups used.','period':{'from':'2026-10-01','to':'2026-10-31','asOf':'2026-10-31','currency':'NZD','registeredFrom':'2026-10-01','gstBasis':'invoice','gstFrequency':'monthly'},'economicJournals':J,'trialBalance':{'rows':tb,'totalDebits':m(tbd),'totalCredits':m(tbc),'balanced':True,'chartPolicy':'Separate GST input asset and output liability, operating costs grouped. Map account roles using static chart setup before reading reports.','oneGstControlAlternative':{'netGstCredit':'225.00','totalDebits':'13500.00','totalCredits':'13500.00'}},'profitLoss':{'accrual':{'revenue':'2700.00','expenses':'1200.00','netIncome':'1500.00'},'cash':{'revenue':'1900.00','expenses':'700.00','netIncome':'1200.00'}},'balanceSheet':{'separateGstControls':{'cash':'11380.00','receivables':'920.00','inputGstAsset':'180.00','assets':'12480.00','payables':'575.00','outputGstLiability':'405.00','liabilities':'980.00','capital':'10000.00','retainedEarnings':'1500.00','equity':'11500.00','balanced':True},'netGstPresentation':{'assets':'12300.00','liabilities':'800.00','equity':'11500.00','netGstLiability':'225.00','balanced':True}},'cashFlow':{'openingCash':'10000.00','financingInflow':'0.00','customerReceipts':'2300.00','customerRefunds':'115.00','supplierPayments':'575.00','paidExpenses':'230.00','operatingNet':'1380.00','netCashFlow':'1380.00','closingCash':'11380.00'},'receivablesAging':{'total':'920.00','current':'920.00','days1To30':'0.00','days31To60':'0.00','days61To90':'0.00','over90':'0.00','unallocatedControl':'0.00','invoiceA':'920.00','invoiceB':'0.00'},'payablesAging':{'total':'575.00','current':'575.00','days1To30':'0.00','days31To60':'0.00','days61To90':'0.00','over90':'0.00','unallocatedControl':'0.00'},'gst':{'invoice':{'salesGross':'3105.00','purchaseGross':'1380.00','output':'405.00','input':'180.00','net':'225.00'},'payments':{'salesGross':'2185.00','purchaseGross':'805.00','output':'285.00','input':'105.00','net':'180.00'},'hybrid':{'salesGross':'3105.00','purchaseGross':'805.00','output':'405.00','input':'105.00','net':'300.00'}},'bankReconciliation':{'opening':'10000.00','movements':[{'date':'2026-10-05','amount':'1150.00','direction':'credit','source':'Receipt A'},{'date':'2026-10-06','amount':'1150.00','direction':'credit','source':'Receipt B'},{'date':'2026-10-08','amount':'575.00','direction':'debit','source':'Supplier payment'},{'date':'2026-10-09','amount':'230.00','direction':'debit','source':'Paid expense'},{'date':'2026-10-12','amount':'115.00','direction':'debit','source':'Refund credit B'}],'netMovement':'1380.00','closing':'11380.00','unmatchedCount':0,'difference':'0.00','condition':'All five statement movements match existing economic postings. No artificial adjustment or duplicate income/expense may force a zero.'},'controls':{'customerCreditClosing':'0.00','baseEconomicJournalCount':11,'baseEconomicJournalDebits':'18165.00','baseEconomicJournalCredits':'18165.00','reconciliation':'Technical import/classification reversal entries may exist but must have no net effect on frozen report or source amounts. Do not require exactly 11 total rows after reconciliation.'}}
expected['version']='working-paper-v2'
expected['openingPolicy']='Opening balances as at 2026-09-30, brought forward to 1 October. This is not an October capital contribution.'
assert sum(D(x['debits']) for x in J)==sum(D(x['credits']) for x in J)==D('18165')
assert D('12480')==D('980')+D('11500')
assert D('12300')==D('800')+D('11500')
assert D('10000')+D('1380')==D('11380')
Path('docs/evidence/full-month-close/expected.json').write_text(json.dumps(expected,indent=2)+'\n')
print(json.dumps({'trialBalanceDebits':m(tbd),'trialBalanceCredits':m(tbc),'cash':m(balances['bank']),'journals':len(J)},indent=2))
