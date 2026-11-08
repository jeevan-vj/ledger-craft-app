import { proofBrowserOptions } from './proof-runtime.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const origin=process.env.ISSUE115_WEB_ORIGIN??'http://127.0.0.1:8080';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const output=process.env.ISSUE115_BANKFEEDS_OUTPUT??'/tmp/ledgercraft-issue115-bankfeeds';await mkdir(output,{recursive:true});
const browser=await chromium.launch(proofBrowserOptions());
const results={platform:'Chromium web, real local API; provider credentials unavailable',cases:[],errors:[]};
try{
 for(const [name,viewport]of[['desktop',{width:1440,height:900}],['phone',{width:390,height:844}]]){
  const context=await browser.newContext({viewport});const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
  let signup;const credentials={name:'Internal feed review',email:`bankfeed-${crypto.randomUUID()}@example.test`,password:`Local-${crypto.randomUUID()}`};for(let attempt=0;attempt<4;attempt++){signup=await context.request.post(origin+'/api/auth/sign-up/email',{headers:{Origin:origin},data:credentials});if(signup.status()!==429)break;await new Promise(resolve=>setTimeout(resolve,11000));}assert.equal(signup.status(),200);
  const profile=await context.request.put(origin+'/api/business-profile',{headers:{Origin:origin},data:{name:'Synthetic bank-feed review',email:'owner@example.test',country:'NZ',gstRegistrationStatus:'not_registered'}});assert.equal(profile.status(),200);
  const response=await context.request.get(origin+'/api/bank-feeds/akahu');assert.equal(response.status(),200);const summary=await response.json();assert.equal(summary.mode,'unavailable');assert.equal(summary.fullAppAvailable,false);assert.deepEqual(summary.accounts,[]);
  await page.goto(origin+'/bank-accounts',{waitUntil:'networkidle'});await page.evaluate(()=>document.querySelector('[aria-label="Dismiss update prompt"]')?.click());const panel=page.locator('section[aria-label="Akahu bank feeds"]');await panel.getByText('No connected accounts.',{exact:true}).waitFor();assert.equal(await panel.getByRole('button',{name:'Refresh Akahu feeds'}).count(),0);await panel.evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(output,name+'-bank-feeds-unavailable.png'),animations:'disabled'});results.cases.push({name,viewport,summary});await context.close();
 }
 assert.deepEqual(results.errors,[]);await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('PASS: real authenticated desktop/phone bank-feed unavailable state; no false public-connect or refresh action; no page errors.');
}finally{await browser.close();}
