import { writeFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { organisationMemberships } from '../../db/schema/identity';
import { closePackManifestSchema, gstPreparationResponseSchema } from '@ledgercraft/contracts';
import { withTestDb } from '../../test/harness';
import { fullMonthCloseFixture } from './full-month-close.test-helper';

async function completedBooks(f: Awaited<ReturnType<typeof fullMonthCloseFixture>>) {
 const imported=await f.post<{transactions:Array<{id:string}>}>('/api/bank-transactions/import',{bankAccountId:f.bank.id,transactions:[
  {transactionDate:'2026-10-05',amount:'1150',type:'credit',description:'Receipt A'}, {transactionDate:'2026-10-06',amount:'1150',type:'credit',description:'Receipt B'},
  {transactionDate:'2026-10-08',amount:'575',type:'debit',description:'Supplier payment'}, {transactionDate:'2026-10-09',amount:'230',type:'debit',description:'Expense'}, {transactionDate:'2026-10-12',amount:'115',type:'debit',description:'Customer refund'},
 ]});
 const session=await f.post('/api/reconciliation-sessions',{bankAccountId:f.bank.id,statementStartDate:'2026-10-01',statementEndDate:'2026-10-31',statementOpeningBalance:'10000',statementClosingBalance:'11380'});
 const entries=await f.request<{entries:Array<{id:string;type:string}>}>('/api/book-entries?from=2026-10-01&to=2026-10-31');
 const sources=[['payment',f.receipts[0].id],['payment',f.receipts[1].id],['bill_payment',f.supplier.id],['expense',f.expense.id],['credit_refund',entries.entries.find(row=>row.type==='credit_refund')!.id]];
 for(const[i,source]of sources.entries())await f.post(`/api/reconciliation-sessions/${session.id}/matches`,{bankTransactionId:imported.transactions[i].id,bookItemType:source[0],bookItemId:source[1],status:'confirmed'});
 await f.post(`/api/reconciliation-sessions/${session.id}/complete`,{},200);
 const gst=gstPreparationResponseSchema.parse(await f.request('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31'));
 const draft=await f.post('/api/tax-returns',{periodStart:'2026-10-01',periodEnd:'2026-10-31',returnType:'GST',totalSales:gst.totalSales,totalPurchases:gst.totalPurchases,gstOnSales:gst.gstOnSales,gstOnPurchases:gst.gstOnPurchases,netGst:gst.netGstPosition,returnData:{preparation:{basis:'invoice',baseCurrency:'NZD',dueDate:'2026-11-30'},gstReview:gst.review}});
 return{session,draft};
}
const path='/api/reports/close-pack?from=2026-10-01&to=2026-10-31';
describe('accountant close pack',()=>{
 it('downloads one verified archive of canonical reports, bank close and retained GST without mutating books',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   const{draft}=await completedBooks(f);await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'October accountant close reviewed',reviewed:true,expectedRevision:0},200);const before=await f.request('/api/reports/financial?from=2026-10-01&to=2026-10-31');
   const response=await f.rawRequest(path);expect(response.status,await response.clone().text()).toBe(200);expect(response.headers.get('Content-Type')).toContain('application/zip');expect(response.headers.get('Content-Disposition')).toContain('Close-pack-2026-10-01-2026-10-31.zip');expect(response.headers.get('Cache-Control')).toContain('no-store');
   const archiveBytes=new Uint8Array(await response.arrayBuffer());await writeFile('/tmp/self-service-close-pack-api.zip',archiveBytes);const members=unzipSync(archiveBytes);const text=(name:string)=>strFromU8(members[name]);const manifest=closePackManifestSchema.parse(JSON.parse(text('manifest.json')));
   expect(manifest.periodLock).toEqual({closedThrough:'2026-10-31',revision:1});expect(manifest.warnings.some(warning=>warning.includes('not closed'))).toBe(false);expect(manifest.warnings.some(warning=>warning.includes('fingerprint differs'))).toBe(false);expect(manifest).toMatchObject({organisationName:'Kauri October Services Limited',period:{from:'2026-10-01',to:'2026-10-31'},basis:'accrual',baseCurrency:'NZD'});
   expect(text('trial-balance.csv')).toContain('"13680.00","13680.00"');expect(text('balance-sheet.csv')).toContain('12480.00');expect(text('profit-loss.csv')).toContain('1500.00');expect(text('cash-flow.csv')).toContain('11380.00');expect(text('receivables.csv')).toContain('920.00');expect(text('payables.csv')).toContain('575.00');expect(text('general-ledger.csv')).toContain('Entry');
   const bank=JSON.parse(text('bank-reconciliations.json'));expect(bank.completedStatements[0]).toMatchObject({finalDifference:'0.00',bookBalance:'11380.00',session:{matchedCount:5,status:'completed'}});
   const tax=JSON.parse(text('gst.json'));expect(tax.preparation).toMatchObject({netGstPosition:'225.00'});expect(tax.retainedRecords.some((record:{id:string})=>record.id===draft.id)).toBe(true);const retained=await f.request<{returnData:{gstCalculation:{fingerprint:string}}}>(`/api/tax-returns/${draft.id}`);expect(tax.retainedRecords.find((record:{id:string})=>record.id===draft.id).returnData.gstCalculation.fingerprint).toBe(retained.returnData.gstCalculation.fingerprint);expect(text('bank-reconciliations.csv')).toContain('11380.00');
   for(const member of manifest.members){const bytes=members[member.name];expect(bytes.byteLength).toBe(member.bytes);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');expect(hash).toBe(member.sha256);}
   const after=await f.request<typeof before>('/api/reports/financial?from=2026-10-01&to=2026-10-31');expect({...after,meta:undefined}).toEqual({...before,meta:undefined});
   await f.post('/api/accounting-periods/reopen',{from:'2026-10-01',reason:'Review supporting sources after close',reviewed:true,expectedRevision:1},200);const extra=await f.post('/api/credit-notes',{invoiceId:f.invoices[0].id,issueDate:'2026-10-20',reason:'Additional credit reviewed then withdrawn',taxInclusive:false,taxRate:'15',items:[{description:'Temporary reviewed credit',quantity:'1',rate:'10'}]});await f.post(`/api/credit-notes/${extra.id}/reverse`,{date:'2026-10-21',reason:'Agreement withdrawn before final close'},200);await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'October sources reviewed and reclosed',reviewed:true,expectedRevision:2},200);
   const changed=await f.rawRequest(path);expect(changed.status).toBe(200);const changedFiles=unzipSync(new Uint8Array(await changed.arrayBuffer()));const currentTax=JSON.parse(strFromU8(changedFiles['gst.json']));expect(currentTax.preparation.netGstPosition).toBe('225.00');expect(currentTax.retainedRecords.find((record:{id:string})=>record.id===draft.id).returnData.gstCalculation.fingerprint).toBe(retained.returnData.gstCalculation.fingerprint);expect(currentTax.preparation.calculation.fingerprint).not.toBe(retained.returnData.gstCalculation.fingerprint);expect(JSON.parse(strFromU8(changedFiles['manifest.json'])).warnings.some((warning:string)=>warning.includes('fingerprint differs'))).toBe(true);
  }finally{await f.sql.end();}
 }));
 it('rejects unauthenticated, invalid and filtered requests; missing preparation is explicit and another company stays isolated',async()=>withTestDb(async()=>{
  const f=await fullMonthCloseFixture();try{
   expect((await f.app.request(path)).status).toBe(401);expect((await f.rawRequest(path+'&organisationId='+crypto.randomUUID())).status).toBe(400);expect((await f.rawRequest('/api/reports/close-pack?from=2026-10-31&to=2026-10-01')).status).toBe(400);
   await f.request(`/api/customers/${f.customers[0].id}`,'PATCH',{name:'=1+2'});
   const r=await f.rawRequest(path);expect(r.status).toBe(200);const members=unzipSync(new Uint8Array(await r.arrayBuffer()));const manifest=JSON.parse(strFromU8(members['manifest.json']));expect(strFromU8(members['receivables.csv'])).toContain("\"'=1+2\"");expect(manifest.warnings.some((warning:string)=>warning.includes('bank statement'))).toBe(true);expect(manifest.warnings.some((warning:string)=>warning.includes('not closed'))).toBe(true);
   const signup=await f.app.request('/api/auth/sign-up/email',{method:'POST',headers:{Origin:'http://localhost:8080','Content-Type':'application/json'},body:JSON.stringify({name:'Other owner',email:`${crypto.randomUUID()}@example.test`,password:'Local-Other-2026!'})});expect(signup.status).toBe(200);const cookie=signup.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
   const other=await f.app.request(path,{headers:{Cookie:cookie}});expect(other.status).toBe(200);const otherFiles=unzipSync(new Uint8Array(await other.arrayBuffer()));expect(strFromU8(otherFiles['profit-loss.csv'])).not.toContain('2700.00');const tax=JSON.parse(strFromU8(otherFiles['gst.json']));expect(tax.preparation).toBeNull();expect(JSON.parse(strFromU8(otherFiles['manifest.json'])).warnings.join(' ')).toContain('GST settings');
   const me=await f.request<{user:{id:string};organisation:{id:string}}>('/api/me');await f.db.update(organisationMemberships).set({role:'member'}).where(and(eq(organisationMemberships.userId,me.user.id),eq(organisationMemberships.organisationId,me.organisation.id)));expect((await f.rawRequest(path)).status).toBe(403);
   await f.db.update(organisationMemberships).set({role:'read_only'}).where(and(eq(organisationMemberships.userId,me.user.id),eq(organisationMemberships.organisationId,me.organisation.id)));expect((await f.rawRequest(path)).status).toBe(200);
  }finally{await f.sql.end();}
 }));
});
