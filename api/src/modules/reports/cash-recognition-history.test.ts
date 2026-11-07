import {describe,it,expect} from 'vitest';
import type {FinancialReportResponse} from '@ledgercraft/contracts';
import {withTestDb} from '../../test/harness';
import {users} from '../../db/schema/identity';
import {withOrganisationTx} from '../auth/bind-organisation';
import {reversePosting} from '../accounting/posting';
import {reverseBillPaymentInTx} from '../purchases/purchases.service';
import {settlementFixture} from '../currency/settlement.test-helper';
type Fixture=Awaited<ReturnType<typeof settlementFixture>>;
const report=(f:Fixture,from:string,to:string)=>f.request<FinancialReportResponse>(`/api/reports/financial?from=${from}&to=${to}&basis=cash&columns=month`,'GET');
const invoice=(f:Fixture,total='1000')=>f.request<{id:string}>('/api/invoices','POST',{customerId:f.customer.id,date:'2026-10-03',dueDate:'2026-10-31',currency:'NZD',taxInclusive:false,taxRate:'15',items:[{description:'Consulting',quantity:'1',rate:total}]},201);
async function credit(f:Fixture,path:string,body:unknown){const r=await f.app.request(path,{method:'POST',headers:{Origin:'http://localhost:8080','Content-Type':'application/json',Cookie:f.cookie,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});expect(r.status,await r.clone().text()).toBe(201);return await r.json() as {id:string;refunds:{id:string}[]};}
describe('cash P&L source carrying allocations and dated history',()=>{
 it('recognises partial receipt/bill costs, preserves prior periods through credit and reversals, and retains actual manual capital cash',async()=>withTestDb(async()=>{const f=await settlementFixture();try{
  const inv=await invoice(f);const first=await f.request('/api/payments','POST',{invoiceId:inv.id,amount:'575',paymentDate:'2026-10-10',paymentMethod:'bank_transfer'},201);
  const bill=await f.request('/api/bills','POST',{vendorId:f.vendor.id,issueDate:'2026-10-03',dueDate:'2026-10-31',currency:'NZD',taxInclusive:false,lines:[{description:'Contractor',quantity:'1',unitPrice:'600',taxRate:'15',accountId:f.cost.id}]},201);await f.request(`/api/bills/${bill.id}/receive`,'POST',{});
  const paid=await f.request(`/api/bills/${bill.id}/payments`,'POST',{bankAccountId:f.bank.id,amount:'230',paymentDate:'2026-10-15'},201) as {payments:{id:string}[]};
  await f.request('/api/expenses','POST',{description:'Paid operating cost',amount:'230',taxAmount:'30',gstTreatment:'standard',status:'approved',currency:'NZD',expenseDate:'2026-10-20'},201);
  const chart=await f.request<{accounts:{id:string;accountNumber:string}[]}>('/api/accounts','GET');const bank=chart.accounts.find(a=>a.accountNumber==='1110')!;
  const capital=await f.request('/api/accounts','POST',{name:'Owner capital',type:'equity',accountClass:'equity',accountNumber:'3000'},201);
  const journal=await f.request('/api/journal-entries','POST',{description:'Posted capital',entryDate:'2026-10-01',amount:'10000',debitAccountId:bank.id,creditAccountId:capital.id},201);await f.request(`/api/journal-entries/${journal.id}`,'PATCH',{status:'posted'});
  const october=await report(f,'2026-10-01','2026-10-31');expect(october.profitLoss).toMatchObject({revenue:'500.00',expenses:'400.00',netIncome:'100.00'});expect(october.cashFlow.closingCash).toBe('10115.00');expect(october.meta.cashRecognition).toBe('settled-source-components-v1');
  const firstCredit=await credit(f,'/api/credit-notes',{invoiceId:inv.id,issueDate:'2026-11-03',reason:'Reviewed proportional credit',taxInclusive:false,taxRate:'15',items:[{description:'Service reduction',quantity:'1',rate:'100'}]});
  await f.request('/api/payments','POST',{invoiceId:inv.id,amount:'230',paymentDate:'2026-11-10',paymentMethod:'bank_transfer'},201);
  await f.request(`/api/bills/${bill.id}/payments`,'POST',{bankAccountId:f.bank.id,amount:'230',paymentDate:'2026-11-12'},201);
  const [owner]=await f.db.select({id:users.id}).from(users);await withOrganisationTx(f.db,owner.id,async(tx,ctx)=>{await reverseBillPaymentInTx(tx,ctx,paid.payments[0].id,{reversalDate:'2026-11-20',reason:'Reverse original supplier settlement'});await reversePosting(tx,ctx,{referenceType:'bill_payment',referenceId:paid.payments[0].id,reversalType:'bill_payment_reversal',date:'2026-11-20',description:'Reviewed supplier payment reversal'});});
  await f.request(`/api/credit-notes/${firstCredit.id}/reverse`,'POST',{date:'2026-11-20',reason:'Reverse credit before receipt correction'});
  await f.request(`/api/payments/${first.id}/reverse`,'POST',{reversalDate:'2026-11-21',reason:'Reverse original customer receipt'});
  await credit(f,'/api/credit-notes',{invoiceId:inv.id,issueDate:'2026-11-22',reason:'Reissue reviewed proportional credit',taxInclusive:false,taxRate:'15',items:[{description:'Service reduction',quantity:'1',rate:'100'}]});
  await f.request('/api/payments','POST',{invoiceId:inv.id,amount:'805',paymentDate:'2026-11-23',paymentMethod:'bank_transfer'},201);
  const comparison=await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-11-01&to=2026-11-30&basis=cash&comparisonFrom=2026-10-01&comparisonTo=2026-10-31','GET');expect(comparison.comparison).toMatchObject({revenue:'500.00',expenses:'400.00',netIncome:'100.00'});
  const november=await report(f,'2026-11-01','2026-11-30');expect(november.profitLoss).toMatchObject({revenue:'400.00',expenses:'0.00',netIncome:'400.00'});
  const after=await report(f,'2026-10-01','2026-10-31');expect(after.profitLoss).toEqual(october.profitLoss);expect(after.cashFlow).toEqual(october.cashFlow);
 }finally{await f.sql.end();}}));
 it('recognises customer-credit refunds only when cash leaves and their reversals only in the later period',async()=>withTestDb(async()=>{const f=await settlementFixture();try{
  const inv=await invoice(f);await f.request('/api/payments','POST',{invoiceId:inv.id,amount:'1150',paymentDate:'2026-10-10',paymentMethod:'bank_transfer'},201);
  const note=await credit(f,'/api/credit-notes',{invoiceId:inv.id,issueDate:'2026-11-03',reason:'Reviewed paid customer return',taxInclusive:false,taxRate:'15',items:[{description:'Returned work',quantity:'1',rate:'200'}]});
  expect((await report(f,'2026-11-01','2026-11-04')).profitLoss.revenue).toBe('0.00');
  const refunded=await credit(f,`/api/credit-notes/${note.id}/refunds`,{bankAccountId:f.bank.id,amount:'115',refundDate:'2026-11-12'});
  expect((await report(f,'2026-11-01','2026-11-30')).profitLoss.revenue).toBe('-100.00');
  await f.request(`/api/credit-notes/${note.id}/refunds/${refunded.refunds[0].id}/reverse`,'POST',{date:'2026-12-01',reason:'Reverse returned funds'});
  expect((await report(f,'2026-10-01','2026-10-31')).profitLoss.revenue).toBe('1000.00');expect((await report(f,'2026-11-01','2026-11-30')).profitLoss.revenue).toBe('-100.00');expect((await report(f,'2026-12-01','2026-12-31')).profitLoss.revenue).toBe('100.00');
 }finally{await f.sql.end();}}));
 it('uses original NZD carrying income/cost and separately posted realised FX, preserving prior cash reports',async()=>withTestDb(async()=>{const f=await settlementFixture();try{
  const payment=await f.request('/api/payments','POST',{invoiceId:f.invoice.id,amount:'50',paymentDate:'2026-10-20',paymentMethod:'bank_transfer',exchangeRateId:f.rate.id},201);
  const before=await report(f,'2026-10-01','2026-10-31');expect(before.profitLoss.revenue).toBe('82.50');expect(before.cashFlow.closingCash).toBe('82.50');
  await f.request(`/api/bills/${f.bill.id}/receive`,'POST',{});await f.request(`/api/bills/${f.bill.id}/payments`,'POST',{bankAccountId:f.bank.id,amount:'50',paymentDate:'2026-10-20',exchangeRateId:f.rate.id},201);
  const settled=await report(f,'2026-10-01','2026-10-31');expect(settled.profitLoss).toMatchObject({revenue:'82.50',expenses:'82.50',netIncome:'0.00'});expect(settled.cashFlow.closingCash).toBe('0.00');
  await f.request(`/api/payments/${payment.id}/reverse`,'POST',{reversalDate:'2026-11-01',reason:'Reverse reviewed FX receipt'});expect((await report(f,'2026-11-01','2026-11-30')).profitLoss.revenue).toBe('-82.50');expect((await report(f,'2026-10-01','2026-10-31')).profitLoss).toEqual(settled.profitLoss);
 }finally{await f.sql.end();}}));
 it('recognises combined bank acceptance once and undoes classification without inventing a cash reversal',async()=>withTestDb(async()=>{const f=await settlementFixture();try{
  const one=await invoice(f,'100');const two=await invoice(f,'200');for(const i of [one,two])await f.request(`/api/invoices/${i.id}`,'PATCH',{status:'sent'});
  const transaction=await f.request('/api/bank-transactions','POST',{bankAccountId:f.bank.id,transactionDate:'2026-10-20',description:'Combined customer settlement',amount:'345',type:'credit'},201);
  await f.request(`/api/bank-transactions/${transaction.id}/accept`,'POST',{allocations:[{documentType:'invoice',documentId:one.id,amount:'115'},{documentType:'invoice',documentId:two.id,amount:'230'}]},201);
  const october=await report(f,'2026-10-01','2026-10-31');expect(october.profitLoss.revenue).toBe('300.00');expect(october.cashFlow.closingCash).toBe('345.00');
  await f.request(`/api/bank-transactions/${transaction.id}/undo`,'POST',{reversalDate:'2026-11-01',reason:'Undo combined customer settlement'});
  const undone=await report(f,'2026-11-01','2026-11-30');expect(undone.profitLoss.revenue).toBe('45.00');expect(undone.cashFlow.netCashFlow).toBe('0.00');expect((await report(f,'2026-10-01','2026-11-30')).profitLoss.revenue).toBe('345.00');expect((await report(f,'2026-10-01','2026-10-31')).profitLoss).toEqual(october.profitLoss);
 }finally{await f.sql.end();}}));
 it('conserves source cents and dates credit rounding changes without rewriting prior cash recognition',async()=>withTestDb(async()=>{const f=await settlementFixture();try{
  const inv=await f.request('/api/invoices','POST',{customerId:f.customer.id,date:'2026-10-03',dueDate:'2026-10-31',currency:'NZD',taxInclusive:true,taxRate:'15',items:[{description:'Small supply',quantity:'1',rate:'0.10'}]},201);
  await f.request('/api/payments','POST',{invoiceId:inv.id,amount:'0.05',paymentDate:'2026-10-10',paymentMethod:'bank_transfer'},201);
  expect((await report(f,'2026-10-01','2026-10-31')).profitLoss.revenue).toBe('0.04');
  const note=await credit(f,'/api/credit-notes',{invoiceId:inv.id,issueDate:'2026-11-03',reason:'Reviewed cent allocation credit',taxInclusive:true,taxRate:'15',items:[{description:'Partial small credit',quantity:'1',rate:'0.05'}]});
  expect((await report(f,'2026-11-01','2026-11-30')).profitLoss.revenue).toBe('0.01');expect((await report(f,'2026-10-01','2026-10-31')).profitLoss.revenue).toBe('0.04');
  await f.request(`/api/credit-notes/${note.id}/reverse`,'POST',{date:'2026-12-01',reason:'Reverse cent allocation credit'});expect((await report(f,'2026-12-01','2026-12-31')).profitLoss.revenue).toBe('-0.01');
 }finally{await f.sql.end();}}));
 it('keeps unsupported receivable cash visible and warns instead of inventing income',async()=>withTestDb(async()=>{const f=await settlementFixture();try{
  await f.request('/api/accounts/initialize','POST',{});const chart=await f.request<{accounts:{id:string;accountNumber:string}[]}>('/api/accounts','GET');const bank=chart.accounts.find(a=>a.accountNumber==='1110')!;const receivable=chart.accounts.find(a=>a.accountNumber==='1200')??await f.request<{id:string}>('/api/accounts','POST',{name:'Unallocated receivables',type:'asset',accountClass:'asset',accountNumber:'1200'},201);
  const journal=await f.request('/api/journal-entries','POST',{description:'Unallocated opening debtor receipt',entryDate:'2026-10-10',amount:'115',debitAccountId:bank.id,creditAccountId:receivable.id},201);await f.request(`/api/journal-entries/${journal.id}`,'PATCH',{status:'posted'});
  const result=await report(f,'2026-10-01','2026-10-31');expect(result.cashFlow.closingCash).toBe('115.00');expect(result.profitLoss.revenue).toBe('0.00');expect(result.meta.warnings?.join(' ')).toContain('unallocated receivable/payable');
 }finally{await f.sql.end();}}));
});
