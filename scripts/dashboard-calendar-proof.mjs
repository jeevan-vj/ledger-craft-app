import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { freshProofDirectory, proofBrowserOptions, localProofOrigin, observeProofNetwork } from './proof-runtime.mjs';
const origin=localProofOrigin(process.env.CLOSE_WEB_URL??'http://127.0.0.1:8080');
const out=await freshProofDirectory(process.env.PROOF_OUTPUT);console.log(`Proof output: ${out}`);
assert.ok(process.env.PROOF_SESSION);
const browser=await chromium.launch(proofBrowserOptions());const results=[];
try {
 for(const timezoneId of ['Pacific/Auckland','UTC']) {
  const context=await browser.newContext({storageState:process.env.PROOF_SESSION,timezoneId,viewport:{width:1440,height:900}});
  const page=await context.newPage();page.setDefaultTimeout(120000);const network=observeProofNetwork(page);const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{const u=new URL(r.url());if(u.pathname==='/api/reports/financial')requests.push({from:u.searchParams.get('from'),to:u.searchParams.get('to'),status:r.status()});});
  await page.goto(origin+'/accounting?from=2026-10-01&to=2026-10-31',{waitUntil:'networkidle'});
  await expect.poll(()=>requests.filter(r=>r.from===r.to).length,{timeout:120000}).toBe(28);
  await network.settle();assert.deepEqual(errors,[]);assert.deepEqual(network.failures,[]);assert.ok(requests.every(r=>r.status===200));
  const actualDays=requests.filter(r=>r.from===r.to).map(r=>r.to).sort((left,right)=>left.localeCompare(right));
  const expectedDays=Array.from({length:28},(_,i)=>`2026-10-${String(i+4).padStart(2,'0')}`);assert.deepEqual(actualDays,expectedDays);
  for(const [month,end] of [['05','31'],['06','30'],['07','31'],['08','31'],['09','30'],['10','31']])assert.ok(requests.some(r=>r.from===`2026-${month}-01`&&r.to===`2026-${month}-${end}`),`Missing selected chart month ${month}`);
  await page.evaluate(()=>document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
  const label=timezoneId.replace('/','-');await page.screenshot({path:`${out}/${label}-desktop.png`,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/${label}-phone.png`,animations:'disabled'});
  results.push({timezoneId,selectedEnd:'2026-10-31',dailyRange:[actualDays[0],actualDays.at(-1)],dailyCount:28,monthlyRange:['2026-05','2026-10'],requests,errors});await context.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS: Auckland and UTC selected October31 retain May–October monthly charts and October4–31 daily charts; all real report requests200');
}finally{await browser.close();}
