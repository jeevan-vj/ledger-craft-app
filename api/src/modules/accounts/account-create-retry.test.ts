import { expect,it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { createAuth } from '../auth/auth';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
async function fixture(run:(post:(body:unknown,key?:string)=>Promise<Response>)=>Promise<void>){return withTestDb(async()=>{const{db,sql}=createDb(getDatabaseUrl());try{const app=createApp({auth:createAuth(db),db});const headers={Origin:'http://localhost:8080','Content-Type':'application/json'};const signup=await app.request('/api/auth/sign-up/email',{method:'POST',headers,body:JSON.stringify({name:'Account retry owner',email:`${crypto.randomUUID()}@example.test`,password:'Local-accountretry123!'})});expect(signup.status).toBe(200);const Cookie=signup.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');await run(async(body,key)=>app.request('/api/accounts',{method:'POST',headers:{...headers,Cookie,...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)}));}finally{await sql.end();}});}
const input={name:'Owner capital',type:'custom',accountClass:'equity',accountNumber:'3000',currency:'NZD',openingBalance:'0.00'};
it('replays a lost account-creation response and rejects a changed request with the same key',async()=>fixture(async post=>{
 const first=await post(input,'account-retry');expect(first.status).toBe(201);const original=await first.json() as{id:string};const retry=await post(input,'account-retry');expect(retry.status).toBe(201);expect((await retry.json()as{id:string}).id).toBe(original.id);expect((await post({...input,name:'Different capital'},'account-retry')).status).toBe(409);
}));
it('rejects duplicate chart codes atomically even without an idempotency key',async()=>fixture(async post=>{
 const results=await Promise.all([post(input),post({...input,name:'Accidental duplicate',accountNumber:' 3000 '})]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);
}));
