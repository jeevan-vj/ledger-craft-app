import { describe, expect, it } from 'vitest';
import { gstPreparationResponseSchema, taxReturnSchema, invoiceSchema, creditNoteSchema } from '@ledgercraft/contracts';
import { completeInvoiceDeliveryInTx, prepareInvoiceDeliveryInTx } from '../invoices/invoices.service';
import { withOrganisationTx } from '../auth/bind-organisation';
import { journalEntryLines } from '../../db/schema/accounts';
import { createPaymentForUser } from '../payments/payments.service';
import { hashIdempotencyPayload } from '../invoices/idempotency';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../../test/harness';
import { fullMonthCloseFixture } from '../reports/full-month-close.test-helper';
import { organisationMemberships } from '../../db/schema/identity';

describe('reviewed company-wide accounting cutoff',()=>{
 it('locks October financial changes atomically, permits November, and retains a reasoned reopen audit',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const before=await f.request('/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual');
   const initial=await f.request<{revision:number;closedThrough:string|null}>('/api/accounting-periods');expect(initial).toMatchObject({closedThrough:null,revision:0});
   const closed=await f.post<{revision:number;closedThrough:string;events:Array<{action:string;reason:string}>}>('/api/accounting-periods/close',{through:'2026-10-31',reason:'October books reconciled and reviewed',reviewed:true,expectedRevision:0},200);expect(closed).toMatchObject({closedThrough:'2026-10-31',revision:1,events:[expect.objectContaining({action:'close',reason:'October books reconciled and reviewed'})]});
   const retry=await f.post<{revision:number;events:unknown[]}>('/api/accounting-periods/close',{through:'2026-10-31',reason:'October books reconciled and reviewed',reviewed:true,expectedRevision:0},200);expect(retry.revision).toBe(1);expect(retry.events).toHaveLength(1);
   await f.post('/api/accounting-periods/close',{through:'2026-11-30',reason:'Stale close request must not apply',reviewed:true,expectedRevision:0},409);
   await f.post('/api/expenses',{description:'Backdated expense',amount:'115',taxAmount:'15',expenseDate:'2026-10-31',currency:'NZD',status:'approved'},409);
   await f.post('/api/invoices',{customerId:f.customers[0].id,date:'2026-10-20',dueDate:'2026-10-31',taxInclusive:false,taxRate:'15',currency:'NZD',items:[{description:'Backdated invoice',quantity:'1',rate:'100'}]},409);
   await f.post('/api/payments',{invoiceId:f.invoices[0].id,amount:'10',paymentDate:'2026-10-31',paymentMethod:'bank_transfer'},409);
   await f.post(`/api/bills/${f.bill.id}/payments`,{bankAccountId:f.bank.id,amount:'10',paymentDate:'2026-10-31'},409);
   await f.request(`/api/expenses/${f.expense.id}`,'DELETE',undefined,409);
   await f.request(`/api/invoices/${f.invoices[0].id}`,'PATCH',{dueDate:'2026-11-30'},409);
   await f.post(`/api/invoices/${f.invoices[0].id}/cancel`,{reason:'Backdated cancellation must not change October'},409);
   await f.request('/api/tax/gst-settings','PUT',{gstRegistrationStatus:'registered',taxId:'49091850',gstRegisteredFrom:'2026-10-01',gstAccountingBasis:'payments',gstFilingFrequency:'monthly',gstPeriodAnchor:10},409);
   const after=await f.request<Record<string,unknown>>('/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual');for(const key of ['profitLoss','balanceSheet','cashFlow','trialBalance','taxSummary','receivablesAging','payablesAging'])expect(after[key]).toEqual((before as Record<string,unknown>)[key]);
   await f.post('/api/payments',{invoiceId:f.invoices[0].id,amount:'20',paymentDate:'2026-11-02',paymentMethod:'bank_transfer'});
   await f.post('/api/credit-notes',{invoiceId:f.invoices[0].id,issueDate:'2026-11-02',reason:'New November service reduction',taxInclusive:false,taxRate:'15',items:[{description:'November adjustment',quantity:'1',rate:'10'}]});
   const historical=await f.request<Record<string,unknown>>('/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual');for(const key of ['profitLoss','balanceSheet','cashFlow','trialBalance','taxSummary','receivablesAging','payablesAging'])expect(historical[key]).toEqual((before as Record<string,unknown>)[key]);
   const reopened=await f.post<{closedThrough:string;revision:number;events:Array<{action:string}>}>('/api/accounting-periods/reopen',{from:'2026-10-01',reason:'Reviewed supplier correction approved by owner',reviewed:true,expectedRevision:1},200);expect(reopened).toMatchObject({closedThrough:'2026-09-30',revision:2,events:[expect.objectContaining({action:'reopen'}),expect.objectContaining({action:'close'})]});
   await f.post('/api/expenses',{description:'Reviewed October correction',amount:'115',taxAmount:'15',expenseDate:'2026-10-31',currency:'NZD',status:'approved'});
  }finally{await f.sql.end();}
 }));
 it('limits closing to financial roles and reopening to owner/admin; history stays company scoped',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const [member]=await f.db.select().from(organisationMemberships);await f.db.update(organisationMemberships).set({role:'member'}).where(eq(organisationMemberships.id,member.id));
   await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'Member may not close accounting',reviewed:true,expectedRevision:0},403);
   await f.db.update(organisationMemberships).set({role:'accountant'}).where(eq(organisationMemberships.id,member.id));await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'Accountant reconciled October books',reviewed:true,expectedRevision:0},200);
   await f.post('/api/accounting-periods/reopen',{from:'2026-10-01',reason:'Accountant cannot reopen without owner',reviewed:true,expectedRevision:1},403);
  }finally{await f.sql.end();}
 }));
 it('blocks credit/refund/journal/bank writes and keeps the closed GST snapshot readable and fileable',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const journal=await f.post('/api/journal-entries',{description:'Reviewed draft journal',entryDate:'2026-10-20',debitAccountId:f.cash.id,creditAccountId:f.capital.id,amount:'1'});
   const gst=gstPreparationResponseSchema.parse(await f.request('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31'));
   const input={periodStart:'2026-10-01',periodEnd:'2026-10-31',returnType:'GST',totalSales:gst.totalSales,totalPurchases:gst.totalPurchases,gstOnSales:gst.gstOnSales,gstOnPurchases:gst.gstOnPurchases,netGst:gst.netGstPosition,returnData:{preparation:{basis:'invoice',baseCurrency:'NZD',dueDate:'2026-11-30'},gstReview:gst.review}};
   const unsent=await f.post('/api/invoices',{customerId:f.customers[0].id,date:'2026-10-20',dueDate:'2026-10-31',taxInclusive:false,taxRate:'15',currency:'NZD',items:[{description:'Unsent closed draft',quantity:'1',rate:'100'}]});
   const draft=await f.post('/api/tax-returns',input);await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'October controls and GST reviewed',reviewed:true,expectedRevision:0},200);
   const cases:Array<[string,string,unknown]>=[
    [`/api/invoices/${unsent.id}/send`,'POST',{}],
    ['/api/credit-notes','POST',{invoiceId:f.invoices[0].id,issueDate:'2026-10-31',reason:'Backdated service reduction review',taxInclusive:false,taxRate:'15',items:[{description:'Adjustment',quantity:'1',rate:'10'}]}],
    [`/api/credit-notes/${f.credits[0].id}/reverse`,'POST',{date:'2026-11-02',reason:'Late reversal of a closed credit'}],
    [`/api/credit-notes/${f.credits[1].id}/refunds`,'POST',{amount:'1',refundDate:'2026-10-31',bankAccountId:f.bank.id}],
    [`/api/payments/${f.receipts[0].id}/reverse`,'POST',{reversalDate:'2026-11-02',reason:'Late reversal of a closed receipt'}],
    ['/api/journal-entries','POST',{description:'Closed manual journal',entryDate:'2026-10-31',debitAccountId:f.cash.id,creditAccountId:f.capital.id,amount:'1'}],
    [`/api/journal-entries/${journal.id}`,'PATCH',{status:'posted'}],
    [`/api/journal-entries/${journal.id}`,'DELETE',undefined],
    ['/api/bank-transactions','POST',{bankAccountId:f.bank.id,transactionDate:'2026-10-31',amount:'1',type:'credit',description:'Closed bank movement'}],
    [`/api/bank-accounts/${f.bank.id}`,'PATCH',{openingBalance:'99999'}],
    ['/api/tax-returns','POST',input],
    [`/api/tax-returns/${draft.id}`,'PATCH',{netGst:'0'}],
   ];
   for(const[path,method,body]of cases){const error=await f.request<{error:{code:string}}>(path,method,body,409);expect(error.error.code,path).toBe('ACCOUNTING_PERIOD_CLOSED');}
   expect(gstPreparationResponseSchema.parse(await f.request('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31')).netGstPosition).toBe('225.00');
   const filed=taxReturnSchema.parse(await f.post(`/api/tax-returns/${draft.id}/file`,{irdReference:'LOCAL-ACCEPTANCE-ONLY'},200));expect(filed).toMatchObject({status:'submitted',netGst:'225.00',irdReference:'LOCAL-ACCEPTANCE-ONLY'});
  }finally{await f.sql.end();}
 }));
 it('isolates companies and rejects a stale active-company assertion without appending history',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const [membership]=await f.db.select().from(organisationMemberships);
   await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'Original company October reviewed',reviewed:true,expectedRevision:0},200);
   const signup=await f.app.request('/api/auth/sign-up/email',{method:'POST',headers:{Origin:'http://localhost:8080','Content-Type':'application/json'},body:JSON.stringify({name:'Independent second owner',email:`period-other-${crypto.randomUUID()}@example.test`,password:'Local-PeriodLock-2026!'})});expect(signup.status).toBe(200);
   const headers={Origin:'http://localhost:8080','Content-Type':'application/json',Cookie:signup.headers.getSetCookie().map(row=>row.split(';')[0]).join('; ')};
   const state=await f.app.request('/api/accounting-periods',{headers});expect(await state.json()).toMatchObject({closedThrough:null,revision:0,events:[]});
   const mismatch=await f.app.request('/api/accounting-periods/close',{method:'POST',headers:{...headers,'X-Expected-Organisation-ID':membership.organisationId},body:JSON.stringify({through:'2026-10-31',reason:'Stale original company form',reviewed:true,expectedRevision:0})});expect(mismatch.status).toBe(409);expect(await mismatch.json()).toMatchObject({error:{code:'ORGANISATION_CHANGED'}});
   expect(await(await f.app.request('/api/accounting-periods',{headers})).json()).toMatchObject({closedThrough:null,revision:0,events:[]});
   expect(await f.request('/api/accounting-periods')).toMatchObject({closedThrough:'2026-10-31',revision:1,events:[expect.objectContaining({action:'close'})]});
  }finally{await f.sql.end();}
 }));

 it('recovers an existing idempotent receipt after close without posting into the locked period',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const [membership]=await f.db.select().from(organisationMemberships);
   const body={invoiceId:f.invoices[0].id,amount:'10.00',paymentDate:'2026-10-20',paymentMethod:'bank_transfer' as const};
   const scope={key:'closed-period-existing-receipt',method:'POST',path:'/api/payments',requestHash:hashIdempotencyPayload(body)};
   const original=await createPaymentForUser(f.db,membership.userId,body,scope);
   await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'Receipt recovered after reviewed close',reviewed:true,expectedRevision:0},200);
   const before=await f.request('/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual');
   expect(await createPaymentForUser(f.db,membership.userId,body,scope)).toEqual(original);
   const after=await f.request('/api/reports/financial?from=2026-10-01&to=2026-10-31&basis=accrual');
   expect({...after,meta:undefined}).toEqual({...before,meta:undefined});
  }finally{await f.sql.end();}
 }));

 it.each(['receipt','delivery'] as const)('refuses first posting of an old draft through later %s and rolls back every source change',async(kind)=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const [membership]=await f.db.select().from(organisationMemberships);
   const draft=invoiceSchema.parse(await f.post('/api/invoices',{customerId:f.customers[0].id,date:'2026-10-20',dueDate:'2026-10-31',taxInclusive:false,taxRate:'15',currency:'NZD',items:[{description:'Draft not posted before cutoff',quantity:'1',rate:'100'}]}));
   const prepared=await withOrganisationTx(f.db,membership.userId,(tx,ctx)=>prepareInvoiceDeliveryInTx(tx,ctx,draft.id,{}));
   const before=await f.db.select().from(journalEntryLines);
   await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'Close before draft publication completes',reviewed:true,expectedRevision:0},200);
   if(kind==='receipt')await f.post('/api/payments',{invoiceId:draft.id,amount:'10',paymentDate:'2026-11-02',paymentMethod:'bank_transfer'},409);
   else await expect(withOrganisationTx(f.db,membership.userId,(tx,ctx)=>completeInvoiceDeliveryInTx(tx,ctx,prepared.invoice))).rejects.toMatchObject({status:409});
   expect(invoiceSchema.parse(await f.request(`/api/invoices/${draft.id}`))).toMatchObject({status:'draft',totalPaid:'0.00'});
   expect(await f.db.select().from(journalEntryLines)).toEqual(before);
  }finally{await f.sql.end();}
 }));

 it('does not allocate a closed bank source through the legacy document-details path',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const bank=await f.post<{transactions:Array<{id:string}>}>('/api/bank-transactions/import',{bankAccountId:f.bank.id,transactions:[{transactionDate:'2026-10-20',amount:'115',type:'credit',description:'Closed allocation source'}]});
   const before=await f.request(`/api/invoices/${f.invoices[0].id}`);
   await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'All October allocations reviewed',reviewed:true,expectedRevision:0},200);
   const error=await f.request<{error:{code:string}}>(`/api/bank-transactions/${bank.transactions[0].id}/details`,'PUT',{documentConnections:[{documentType:'invoice',documentId:f.invoices[0].id,amount:'115'}],splits:[],attachments:[]},409);expect(error.error.code).toBe('ACCOUNTING_PERIOD_CLOSED');
   expect(await f.request(`/api/invoices/${f.invoices[0].id}`)).toEqual(before);
  }finally{await f.sql.end();}
 }));

 it.each(['credit','refund'] as const)('recovers an already accepted %s reversal after close without another journal',async(kind)=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const credit=creditNoteSchema.parse(await f.request(`/api/credit-notes/${f.credits[1].id}`));
   const path=kind==='credit'?`/api/credit-notes/${f.credits[0].id}/reverse`:`/api/credit-notes/${credit.id}/refunds/${credit.refunds[0].id}/reverse`;
   const input={date:'2026-10-20',reason:'Reviewed exact reversal recovery'};
   const accepted=await f.post(path,input,200);const lines=await f.db.select().from(journalEntryLines);
   await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'October accepted reversals reconciled',reviewed:true,expectedRevision:0},200);
   expect(await f.post(path,input,200)).toEqual(accepted);expect(await f.db.select().from(journalEntryLines)).toEqual(lines);
   await f.post(path,{...input,reason:'Different reversal must not replay'},409);
  }finally{await f.sql.end();}
 }));

 it('permits already-completed no-op lifecycle requests after close without changing posted journal metadata',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const journals=await f.request<{journalEntries:Array<{id:string;status:string}>}>('/api/journal-entries');const posted=journals.journalEntries.find(row=>row.status==='posted')!;
   await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'Reconcile posted lifecycle operations',reviewed:true,expectedRevision:0},200);
   await f.post(`/api/bills/${f.bill.id}/receive`,{},200);
   await f.post(`/api/invoices/${f.invoices[0].id}/restore`,{reason:'No financial restore required'},200);
   const before=await f.request(`/api/journal-entries/${posted.id}`);expect(await f.request(`/api/journal-entries/${posted.id}`,'PATCH',{status:'posted'})).toEqual(before);
  }finally{await f.sql.end();}
 }));

 it('resending a paid closed invoice does not rewrite its posted financial status',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const [membership]=await f.db.select().from(organisationMemberships);
   const prepared=await withOrganisationTx(f.db,membership.userId,(tx,ctx)=>prepareInvoiceDeliveryInTx(tx,ctx,f.invoices[1].id,{}));expect(prepared.invoice.status).toBe('paid');
   await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'Paid October invoices and GST reconciled',reviewed:true,expectedRevision:0},200);
   const completed=await withOrganisationTx(f.db,membership.userId,(tx,ctx)=>completeInvoiceDeliveryInTx(tx,ctx,prepared.invoice));expect(completed).toEqual(prepared.invoice);expect(invoiceSchema.parse(await f.request(`/api/invoices/${prepared.invoice.id}`))).toEqual(prepared.invoice);
  }finally{await f.sql.end();}
 }));

});
