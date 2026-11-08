import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { proofBrowserOptions, localProofOrigin, observeProofNetwork } from './proof-runtime.mjs';
const origin=localProofOrigin(process.env.CLOSE_WEB_URL??'http://localhost:8080');
const out=process.env.PROOF_OUTPUT??'/tmp/ledgercraft-payment-refresh';
await mkdir(out,{recursive:true});
const browser=await chromium.launch(proofBrowserOptions());
const context=await browser.newContext({timezoneId:'Pacific/Auckland'});
const page=await context.newPage();page.setDefaultTimeout(120000);
const network=observeProofNetwork(page);
const navigate=async (...args)=>{await network.settle();const result=await page.goto(...args);await network.settle();return result;};
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Auckland'}).format(new Date());
const results={platform:'real local Vite web and Hono/SQLite',setup:'API-created synthetic user, profile, customer and issued invoices; payments through actual UI',cases:[]};
async function api(path,method='GET',data,status=200){const r=await context.request.fetch(origin+path,{method,data,headers:{Origin:origin}});assert.equal(r.status(),status,`${path}: ${await r.text()}`);return r.json();}
try{
 await api('/api/auth/sign-up/email','POST',{name:'Payment refresh reviewer',email:`refresh-${crypto.randomUUID()}@example.test`,password:`Local-${crypto.randomUUID()}`});
 await api('/api/business-profile','PUT',{name:'Refresh Verification Limited',email:'owner@example.test',country:'NZ',gstRegistrationStatus:'registered',taxId:'49091850',gstRegisteredFrom:'2026-01-01',gstAccountingBasis:'invoice',gstFilingFrequency:'monthly',gstPeriodAnchor:10});
 const customer=await api('/api/customers','POST',{name:'Synthetic refresh customer',email:'buyer@example.test'},201);
 for(const [label,width,height] of [['desktop',1440,900],['phone',390,844]]){
  const invoice=await api('/api/invoices','POST',{customerId:customer.id,date,dueDate:date,currency:'NZD',taxInclusive:false,taxRate:'15',items:[{description:`Refresh ${label}`,quantity:'1',rate:'100'}]},201);
  await api(`/api/invoices/${invoice.id}`,'PATCH',{status:'sent'});
  await page.setViewportSize({width,height});await navigate(origin+'/payments',{waitUntil:'networkidle'});
  await page.evaluate(()=>document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
  await page.getByRole('button',{name:/^Record payment$/i}).first().click();const dialog=page.getByRole('dialog');
  await dialog.getByText(`#${invoice.invoiceNumber}`,{exact:true}).click();await dialog.getByLabel(/^Payment Amount/).fill('57.50');
  const posted=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/payments'&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Record Payment',exact:true}).click();const response=await posted;assert.equal(response.status(),201);const payment=await response.json();
  // Completion includes the post-write invoice/receipt refresh, not only HTTP201.
  await expect(dialog).not.toBeVisible();await page.waitForLoadState('networkidle');
  await network.settle();await page.reload({waitUntil:'networkidle'});await network.settle();await page.getByRole('main').getByText(invoice.invoiceNumber,{exact:false}).filter({visible:true}).first().waitFor();
  const saved=await api(`/api/invoices/${invoice.id}`);assert.equal(saved.balanceDue,'57.50');
  const receipts=await api(`/api/receipts?paymentId=${payment.id}`);const rows=receipts.receipts??receipts;assert.equal(rows.length,1);
  const ledger=await api(`/api/reports/general-ledger?from=${date}&to=${date}&basis=accrual`);
  const entries=ledger.lines.filter(l=>l.referenceType==='invoice_payment'&&l.referenceId===payment.id);assert.equal(new Set(entries.map(l=>l.journalEntryId)).size,1);
  await page.screenshot({path:`${out}/${label}-payment-persisted.png`,animations:'disabled'});
  results.cases.push({label,invoiceId:invoice.id,paymentId:payment.id,amount:payment.amount,balanceDue:saved.balanceDue,receipts:rows.length,paymentJournals:1});
 }
 assert.deepEqual(errors,[]);results.errors=errors;await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log('PASS: desktop/phone UI payments, persisted 57.50 balances, one receipt/journal each, no page or console errors');
}catch(e){await page.screenshot({path:`${out}/failure.png`});await writeFile(`${out}/failure.json`,JSON.stringify({errors,message:String(e)},null,2));throw e;}finally{await browser.close();}
