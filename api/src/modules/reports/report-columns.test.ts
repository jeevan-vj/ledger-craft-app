import { describe, expect, it } from 'vitest';
import { financialReportForUser } from './reports.service';
import { withTestDb, ORG_A, USER_A } from '../../test/harness';
import { users, organisations, organisationMemberships } from '../../db/schema/identity';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import type { Database } from '../../db/client';
const q={from:'2026-04-01',to:'2027-03-31',basis:'accrual' as const,baseCurrency:'NZD' as const};
async function seed(db:Database,count=12) {
 await db.insert(users).values({id:USER_A,name:'Report owner',email:'report-columns@example.test'});
 await db.insert(organisations).values({id:ORG_A,name:'Golden report company'});
 await db.insert(organisationMemberships).values({organisationId:ORG_A,userId:USER_A,role:'owner'});
 const cash=crypto.randomUUID(),revenue=crypto.randomUUID();
 await db.insert(accounts).values([{id:cash,organisationId:ORG_A,userId:USER_A,name:'Bank',type:'bank',accountClass:'asset',normalBalance:'debit',accountNumber:'1110'},{id:revenue,organisationId:ORG_A,userId:USER_A,name:'Consulting',type:'revenue',accountClass:'revenue',normalBalance:'credit',accountNumber:'4000'}]);
 for(let offset=0;offset<count;offset+=100){
  const entries=Array.from({length:Math.min(100,count-offset)},(_,i)=>{const month=(offset+i)%12;return {id:crypto.randomUUID(),organisationId:ORG_A,userId:USER_A,entryNumber:`COL-${offset+i}`,entryDate:`${month<9?'2026':'2027'}-${String((month+3)%12+1).padStart(2,'0')}-15`,description:'Golden source',referenceType:'bank_transaction',totalAmount:'10.01',status:'posted'};});
  await db.insert(journalEntries).values(entries);
  await db.insert(journalEntryLines).values(entries.flatMap(e=>[{organisationId:ORG_A,journalEntryId:e.id,accountId:cash,debitAmount:'10.01',creditAmount:'0',lineOrder:0},{organisationId:ORG_A,journalEntryId:e.id,accountId:revenue,debitAmount:'0',creditAmount:'10.01',lineOrder:1}]));
 }
}
describe('posted-ledger report columns',()=>{
 it('matches each single month and full totals on accrual and cash basis, with quarter and clipped windows',async()=>{
  await withTestDb(async({db})=>{await seed(db);
   for(const basis of ['accrual','cash'] as const){
    const full=await financialReportForUser(db,USER_A,{...q,basis,columns:'month'});
    expect(full.columns?.periods).toHaveLength(12);expect(full.profitLoss.netIncome).toBe('120.12');expect(full.cashFlow.netCashFlow).toBe('120.12');
    for(const column of full.columns!.periods){const single=await financialReportForUser(db,USER_A,{...q,basis,from:column.from,to:column.to});expect(column.profitLoss).toEqual(single.profitLoss);expect(column.cashFlow).toEqual(single.cashFlow);expect(column.profitLoss.netIncome).toBe('10.01');}
    expect((await financialReportForUser(db,USER_A,{...q,basis,columns:'quarter'})).columns?.periods.map(c=>c.profitLoss.netIncome)).toEqual(['30.03','30.03','30.03','30.03']);
   }
   const legacy=await financialReportForUser(db,USER_A,q);expect(legacy).not.toHaveProperty('columns');
   const partial=await financialReportForUser(db,USER_A,{...q,from:'2026-04-20',to:'2026-05-20',columns:'month'});expect(partial.columns?.periods.map(c=>c.profitLoss.netIncome)).toEqual(['0.00','10.01']);
  });
 });
 it('builds twelve columns from 10,000 real SQLite journal lines within the 10 second request budget',async()=>{
  await withTestDb(async({db})=>{await seed(db,5000);const start=performance.now();const report=await financialReportForUser(db,USER_A,{...q,columns:'month'});const duration=performance.now()-start;console.info(JSON.stringify({case:'10000-lines-12-columns',durationMs:duration}));expect(report.columns?.periods).toHaveLength(12);expect(report.profitLoss.netIncome).toBe('50050.00');expect(duration).toBeLessThan(10_000);});
 },30_000);
});
