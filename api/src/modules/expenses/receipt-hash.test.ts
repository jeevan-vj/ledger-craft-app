import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { withTestDb } from '../../test/harness';
describe('receipt duplicate identity', () => {
 it('round-trips a receipt digest and exact amounts without making duplicate warnings a posting block', async () => withTestDb(async () => {
  const { db, sql } = createDb(getDatabaseUrl());
  try {
   const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
   const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: { Origin:'http://localhost:8080','Content-Type':'application/json'}, body: JSON.stringify({ name:'Receipt reviewer',email:`receipt-${crypto.randomUUID()}@example.test`,password:'LocalReceiptPassword123'}) });
   const cookie = signup.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
   const headers = {Origin:'http://localhost:8080','Content-Type':'application/json',Cookie:cookie};
   const input = {description:'Receipt supplies',vendorName:'Supplier',amount:'115.00',taxAmount:'15.00',expenseDate:'2026-10-02',receiptUrl:'/api/objects/file?key=receipt',receiptHash:'a'.repeat(64)};
   for(let i=0;i<2;i++) {
    const response=await app.request('/api/expenses',{method:'POST',headers,body:JSON.stringify(input)});
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({receiptHash:input.receiptHash,amount:'115.00',taxAmount:'15.00'});
   }
   const listing=await app.request('/api/expenses',{headers});const saved=(await listing.json() as {expenses:Array<{id:string}>}).expenses[0];
   const replacement=await app.request(`/api/expenses/${saved.id}`,{method:'PATCH',headers,body:JSON.stringify({receiptUrl:null})});expect.soft(await replacement.json()).toMatchObject({receiptHash:null,receiptUrl:null});
   const invalid=await app.request('/api/expenses',{method:'POST',headers,body:JSON.stringify({...input,amount:'10.00',taxAmount:'15.00'})});expect(invalid.status).toBe(422);
   const retryHeaders={...headers,'Idempotency-Key':'reviewed-receipt-save'};
   const first=await app.request('/api/expenses',{method:'POST',headers:retryHeaders,body:JSON.stringify(input)});const firstBody=await first.json() as {id:string};
   const replay=await app.request('/api/expenses',{method:'POST',headers:retryHeaders,body:JSON.stringify(input)});
   expect(await replay.json()).toMatchObject({id:firstBody.id});
   const changed=await app.request('/api/expenses',{method:'POST',headers:retryHeaders,body:JSON.stringify({...input,amount:'230.00'})});expect(changed.status).toBe(409);
  }finally{await sql.end();}
 }));
});
