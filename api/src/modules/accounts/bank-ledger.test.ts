import { describe, expect, it } from 'vitest';
import { accountSchema } from '@ledgercraft/contracts';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { eq } from 'drizzle-orm';
import { organisationMemberships } from '../../db/schema/identity';
import { withTestDb } from '../../test/harness';

const origin={Origin:'http://localhost:8080','Content-Type':'application/json'};
describe('self-service bank ledger preparation',()=>{
 it('creates one correctly classified linked account with no journal, retries safely and isolates companies',async()=>withTestDb(async()=>{
  const {db,sql}=createDb(getDatabaseUrl());
  try{
   const app=createApp({auth:createAuth(db),db,checkDatabase:async()=>true});
   async function signup(name:string){const r=await app.request('/api/auth/sign-up/email',{method:'POST',headers:origin,body:JSON.stringify({name,email:`${crypto.randomUUID()}@example.test`,password:'Local-bank-ledger123!'})});expect(r.status).toBe(200);return {...origin,Cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')};}
   const owner=await signup('Chart owner');const other=await signup('Other chart owner');
   const created=await app.request('/api/bank-accounts',{method:'POST',headers:owner,body:JSON.stringify({accountName:'Operating',accountNumber:'12-0000-0000001-00',bankName:'Synthetic',accountType:'checking',currency:'NZD',openingBalance:'10000'})});expect(created.status).toBe(201);const bank=await created.json() as {id:string};
   const request=(headers:typeof owner,id=bank.id)=>app.request('/api/accounts/bank-ledger',{method:'POST',headers,body:JSON.stringify({bankAccountId:id})});
   const wrongScope=await app.request('/api/accounts/bank-ledger',{method:'POST',headers:{...owner,'X-Expected-Organisation-ID':crypto.randomUUID()},body:JSON.stringify({bankAccountId:bank.id})});expect(wrongScope.status).toBe(409);
   const wrongCreate=await app.request('/api/accounts',{method:'POST',headers:{...owner,'X-Expected-Organisation-ID':crypto.randomUUID()},body:JSON.stringify({name:'Wrong company',type:'expense'})});expect(wrongCreate.status).toBe(409);
   const first=await request(owner);expect(first.status).toBe(200);const ledger=accountSchema.parse(await first.json());expect(ledger).toMatchObject({name:'Operating',type:'bank',accountClass:'asset',currency:'NZD',openingBalance:'0.00',currentBalance:'0.00',accountNumber:`BANK-${bank.id.slice(0,8).toUpperCase()}`});
   expect(accountSchema.parse(await(await request(owner)).json()).id).toBe(ledger.id);
   expect((await request(other)).status).toBe(404);expect((await request(owner,crypto.randomUUID())).status).toBe(404);
   const journals=await app.request('/api/journal-entries',{headers:owner});expect((await journals.json()as{journalEntries:unknown[]}).journalEntries).toEqual([]);
   const list=await app.request('/api/accounts',{headers:owner});expect((await list.json()as{accounts:{id:string}[]}).accounts.filter(x=>x.id===ledger.id)).toHaveLength(1);
   const change=await app.request(`/api/accounts/${ledger.id}`,{method:'PATCH',headers:owner,body:JSON.stringify({accountClass:'liability'})});expect(change.status).toBe(200);expect((await request(owner)).status).toBe(409);
   const me=await(await app.request('/api/me',{headers:owner})).json() as{user:{id:string}};await db.update(organisationMemberships).set({role:'read_only'}).where(eq(organisationMemberships.userId,me.user.id));expect((await request(owner)).status).toBe(403);
  }finally{await sql.end();}
 }));
 it('requires authentication',async()=>{expect((await createApp().request('/api/accounts/bank-ledger',{method:'POST',headers:origin,body:JSON.stringify({bankAccountId:crypto.randomUUID()})})).status).toBe(401);});
});
