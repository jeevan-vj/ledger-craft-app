import { expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
it('retains once-only statement setup and bank-side adjustments across lost-response retries', async () => withTestDb(async () => {
 const f=await settlementFixture();try {
  const headers={Origin:'http://localhost:8080','Content-Type':'application/json',Cookie:f.cookie,'Idempotency-Key':'statement-create-1'};
  const body={bankAccountId:f.bank.id,statementStartDate:'2026-10-01',statementEndDate:'2026-10-31',statementOpeningBalance:'0.00',statementClosingBalance:'-0.04'};
  const create=()=>f.app.request('/api/reconciliation-sessions',{method:'POST',headers,body:JSON.stringify(body)});
  const [a,b]=await Promise.all([create(),create()]);expect(a.status).toBe(201);expect(b.status).toBe(201);const first=await a.json() as {id:string};expect(await b.json()).toEqual(first);
  expect((await f.request<{sessions:unknown[]}>(`/api/reconciliation-sessions?bankAccountId=${f.bank.id}`,'GET')).sessions).toHaveLength(1);
  const path=`/api/reconciliation-sessions/${first.id}/adjustments`;const adjustment={adjustmentType:'bank_error',description:'Reviewed bank correction',amount:'0.04',affectsBank:true,affectsBook:false};
  const add=(input:unknown=adjustment,key='adjustment-1')=>f.app.request(path,{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify(input)});
  const [one,two]=await Promise.all([add(),add()]);expect(one.status).toBe(201);expect(two.status).toBe(201);expect(await two.json()).toEqual(await one.json());
  expect((await f.request<{adjustments:unknown[]}>(path,'GET')).adjustments).toHaveLength(1);
  expect((await add({...adjustment,amount:'0.08'})).status).toBe(409);
  const summary=await f.request<{adjustedBankBalance:string;finalDifference:string}>(`/api/reconciliation-sessions/${first.id}/summary`,'GET');expect(summary.adjustedBankBalance).toBe('0.00');expect(summary.finalDifference).toBe('0.00');
  await f.request(`/api/reconciliation-sessions/${first.id}/complete`,'POST',{},200);
  expect((await add(adjustment,'new-after-completion')).status).toBe(409);
  expect((await add()).status).toBe(201);
 }finally{await f.sql.end();}
}));
