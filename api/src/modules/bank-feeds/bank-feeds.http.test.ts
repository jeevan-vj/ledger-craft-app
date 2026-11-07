import { describe,it,expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app';
import { createAuth } from '../auth/auth';
import { withTestDb } from '../../test/harness';
import { organisationMemberships } from '../../db/schema/identity';
import { AkahuGateway } from './akahu.gateway';
const headers={Origin:'http://localhost:8080','Content-Type':'application/json'};
describe('authenticated bank feed HTTP boundary',()=>{
 it('scopes actual requests, schedules daily after sync, blocks read-only writes and never serialises credentials',async()=>withTestDb(async({db})=>{
  const auth=createAuth(db);let app=createApp({auth,db});
  expect((await app.request('/api/bank-feeds/akahu')).status).toBe(401);
  const signup=await app.request('/api/auth/sign-up/email',{method:'POST',headers,body:JSON.stringify({name:'Feed owner',email:`${crypto.randomUUID()}@example.test`,password:'Local-password123'})});
  const cookie=signup.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');const userId=(await signup.json() as {user:{id:string}}).user.id;
  const [membership]=await db.select().from(organisationMemberships).where(eq(organisationMemberships.userId,userId));
  const dates:number[]=[];const provider=new AkahuGateway('app_fixture','token_fixture',async request=>{
   const path=new URL(new Request(request).url).pathname;
   return new Response(path==='/v1/accounts'?'{"success":true,"items":[{"_id":"acc_http","name":"HTTP account","formatted_account":"12-3333","status":"ACTIVE","connection":{"name":"Fixture Bank"},"balance":{"currency":"NZD","current":99.10}}]}':'{"success":true,"items":[{"_id":"tx_http","date":"2026-10-01T00:00:00Z","description":"Fixture sale","amount":99.10}],"cursor":{"next":null}}');
  });
  app=createApp({auth,db,bankFeedConfig:{organisationId:membership!.organisationId,userId,gateway:provider},scheduleRecurringAlarm:async at=>{dates.push(at);}});
  const response=await app.request('/api/bank-feeds/akahu/sync',{method:'POST',headers:{...headers,Cookie:cookie},body:'{}'});
  expect(response.status).toBe(200);const text=await response.text();expect(text).not.toContain('token_fixture');expect(text).not.toContain('app_fixture');expect(JSON.parse(text)).toMatchObject({imported:1,summary:{mode:'personal',status:'connected'}});expect(dates).toHaveLength(1);
  expect((await app.request('/api/bank-feeds/akahu/connect',{headers:{Cookie:cookie}})).status).toBe(503);
  await db.update(organisationMemberships).set({role:'read_only'}).where(eq(organisationMemberships.id,membership!.id));
  expect((await app.request('/api/bank-feeds/akahu',{headers:{Cookie:cookie}})).status).toBe(200);
  expect((await app.request('/api/bank-feeds/akahu/sync',{method:'POST',headers:{...headers,Cookie:cookie},body:'{}'})).status).toBe(403);
 }));
});
