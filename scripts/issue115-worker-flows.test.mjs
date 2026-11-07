import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const root=fileURLToPath(new URL('../',import.meta.url));
test('actual Worker Identity/Ledger routes preserve collections and authoritative recurring execution', {timeout:120000}, async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'remaining-worker-flow-'));
 process.env.WRANGLER_LOG_PATH=path.join(tmpdir(),`remaining-worker-${Date.now()}.log`);process.env.WRANGLER_SEND_METRICS='false';
 const {unstable_dev}=await import('wrangler'); const config=path.join(dir,'wrangler.json');
 await writeFile(config,JSON.stringify({name:'remaining-worker-flow',main:path.join(root,'deploy/api/worker.ts'),compatibility_date:'2026-09-11',compatibility_flags:['nodejs_compat'],durable_objects:{bindings:[{name:'IDENTITY',class_name:'Identity'},{name:'LEDGERS',class_name:'Ledger'}]},migrations:[{tag:'sqlite-v1',new_sqlite_classes:['Identity','Ledger']}],rules:[{type:'Text',globs:['**/*.sql'],fallthrough:true}]}));
 let worker;
 try {
  worker=await unstable_dev(path.join(root,'deploy/api/worker.ts'),{config,local:true,ip:'127.0.0.1',port:0,persist:false,logLevel:'error',vars:{BETTER_AUTH_SECRET:'local-worker-flow-test-secret-32chars',BETTER_AUTH_URL:'http://localhost:8080',BETTER_AUTH_TRUSTED_ORIGINS:'http://localhost:8080',APP_URL:'http://localhost:8080',NODE_ENV:'test'},experimental:{disableExperimentalWarning:true,testMode:true}});
  let cookie='';async function request(route,method='GET',body,status=200,anonymous=false){const response=await worker.fetch(route,{method,headers:{Origin:'http://localhost:8080','Content-Type':'application/json',...(anonymous?{}:{Cookie:cookie})},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await response.text();assert.equal(response.status,status,`${method} ${route}: ${raw}`);if(route.includes('sign-up'))cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');return raw?JSON.parse(raw):null;}
  await request('/api/auth/sign-up/email','POST',{name:'Worker reviewer',email:`worker-${crypto.randomUUID()}@example.test`,password:`Local-${crypto.randomUUID()}`});
  await request('/api/me');await request('/api/business-profile','PUT',{name:'Worker synthetic company',email:'owner@example.test',country:'NZ',gstRegistrationStatus:'not_registered'});
  const customer=await request('/api/customers','POST',{name:'Worker buyer',email:'buyer@example.test'},201);
  const template=await request('/api/recurring-templates','POST',{name:'Worker monthly cost',payload:{kind:'expense',input:{description:'Reviewed monthly cost',amount:'100.00',taxAmount:'0.00',gstTreatment:'exempt',expenseDate:'2027-01-31'}},schedule:{frequency:'monthly',interval:1,startDate:'2027-01-31',timezone:'Pacific/Auckland',localTime:'09:00'}},201);
  const run=await request('/api/recurring-runs/process','POST',{now:'2027-01-31T21:00:00Z',limit:1});assert.equal(run.succeeded,1);
  const expenses=await request('/api/expenses');assert.equal(expenses.expenses.length,1);assert.equal(expenses.expenses[0].amount,'100.00');
  const query={type:'activity',from:'2026-10-01',to:'2026-10-31'};
  const share=await request(`/api/customers/${customer.id}/statement/share`,'POST',query,201);
  const snapshot=await request(`/api/public/customer-statements/${share.token}`,'GET',undefined,200,true);assert.equal(snapshot.closingBalance,'0.00');
  const settings=await request('/api/payment-reminders/settings');assert.equal(settings.emailAvailable,false);
  assert.ok(template.id);assert.equal((await request('/api/bank-feeds/akahu')).mode,'unavailable');
 } finally {if(worker)await worker.stop();await rm(dir,{recursive:true,force:true});}
});
