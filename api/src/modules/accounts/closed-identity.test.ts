import { expect,it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { fullMonthCloseFixture } from '../reports/full-month-close.test-helper';
it('keeps a closed period account classification immutable while allowing a new future account',async()=>withTestDb(async()=>{
 const f=await fullMonthCloseFixture();try{
  await f.post('/api/accounting-periods/close',{through:'2026-10-31',reason:'Independent October totals reviewed',reviewed:true,expectedRevision:0},200);
  await f.request(`/api/accounts/${f.cash.id}`,'PATCH',{accountClass:'liability'},409);
  await f.post('/api/accounts',{name:'Future marketing',type:'expense',accountClass:'expense',accountNumber:'5101',currency:'NZD'});
 }finally{await f.sql.end();}
}));
