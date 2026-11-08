import { proofBrowserOptions } from './proof-runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { jsPDF } from 'jspdf';
const origin=process.env.RECEIPTS_ORIGIN||'http://127.0.0.1:8080';
const output=process.env.RECEIPTS_OUTPUT||'/tmp/ledgercraft-receipts-proof';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));await mkdir(output,{recursive:true});
const browser=await chromium.launch(proofBrowserOptions());const errors=[];const results={platform:'Chromium responsive web with real local Hono and SQLite; AI-unavailable fallback',errors,cases:{}};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNicAAAAASUVORK5CYII=','base64');
const pdf=new jsPDF({compress:false});pdf.text('Harbour Supplies receipt total115.00 GST15.00',15,15);const pdfBytes=Buffer.from(pdf.output('arraybuffer'));
try{for(const [name,viewport] of Object.entries({desktop:{width:1440,height:900},phone:{width:390,height:844}})){
 const context=await browser.newContext({viewport});const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));let expensePosts=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/expenses')expensePosts++});
 const req=async(path,method='GET',body)=>{
  for(let attempt=0;attempt<4;attempt++){
   const response=await context.request.fetch(origin+path,{method,headers:{Origin:origin},data:body});
   if(path==='/api/auth/sign-up/email'&&response.status()===429&&attempt<3){await new Promise(resolve=>setTimeout(resolve,11000));continue;}
   assert.ok(response.ok(),`${method}${path}:${response.status()} ${await response.text()}`);return response.json();
  }
 };
 await req('/api/auth/sign-up/email','POST',{name:'Receipt business owner',email:`receipt-proof-${name}-${Date.now()}@example.test`,password:`LocalReceipt-${crypto.randomUUID()}`});
 await req('/api/business-profile','PUT',{name:`Harbour Receipts ${name}`,email:'owner@example.test',country:'NZ',gstRegistrationStatus:'not_registered'});
 await page.goto(origin+'/expenses',{waitUntil:'networkidle'});await page.evaluate(()=>document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
 const files=page.getByLabel('Receipt files');await files.waitFor();await page.getByText('Automatic scanning is unavailable.',{exact:false}).waitFor();
 await files.setInputFiles([{name:'receipt-one.png',mimeType:'image/png',buffer:png},{name:'receipt-two.png',mimeType:'image/png',buffer:Buffer.concat([png,Buffer.from('second')])},{name:'receipt-three.png',mimeType:'image/png',buffer:Buffer.concat([png,Buffer.from('third')])},{name:'receipt-four.pdf',mimeType:'application/pdf',buffer:pdfBytes}]);
 await page.getByText('Needs review',{exact:true}).nth(3).waitFor();assert.equal(expensePosts,0);assert.equal((await req('/api/expenses')).expenses.length,0);
 await page.locator('section[aria-label="Receipts inbox"]').scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${name}-01-four-uploaded-review-drafts.png`});
 await page.reload({waitUntil:'networkidle'});await page.getByText('Needs review',{exact:true}).nth(3).waitFor();
 await page.getByLabel('Description for receipt-one.png').fill('Reviewed office supplies');await page.getByLabel('Vendor for receipt-one.png').fill('Harbour Supplies');await page.getByLabel('Date for receipt-one.png').fill('2026-10-01');await page.getByLabel('Total for receipt-one.png').fill('115.00');await page.getByLabel('GST for receipt-one.png').fill('15.00');await page.getByLabel('GST treatment for receipt-one.png').selectOption('standard');await page.getByLabel('I reviewed receipt-one.png and its GST treatment').check();
 await page.getByRole('button',{name:'Save expense from receipt-one.png',exact:true}).click();await page.getByText('Saved',{exact:true}).waitFor();const expense=(await req('/api/expenses')).expenses[0];assert.equal(expense.amount,'115.00');assert.equal(expense.taxAmount,'15.00');assert.equal(expense.status,'pending');assert.match(expense.receiptHash,/^[a-f0-9]{64}$/);assert.ok(expense.receiptUrl);assert.equal(expensePosts,1);
 const attachment=await context.request.get(origin+expense.receiptUrl);assert.equal(attachment.status(),200);assert.deepEqual(await attachment.body(),png);
 await page.getByText('receipt-one.png',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${name}-02-reviewed-expense-saved.png`});
 await files.setInputFiles([{name:'same-receipt.png',mimeType:'image/png',buffer:png}]);await page.getByLabel('Description for same-receipt.png').waitFor();await page.getByLabel('Description for same-receipt.png').fill('Duplicate review');await page.getByLabel('Total for same-receipt.png').fill('115.00');await page.getByLabel('GST for same-receipt.png').fill('15.00');await page.getByLabel('GST treatment for same-receipt.png').selectOption('standard');await page.getByLabel('I reviewed same-receipt.png and its GST treatment').check();assert.equal(await page.getByRole('button',{name:'Save expense from same-receipt.png',exact:true}).isDisabled(),true);
 await page.getByText('Possible duplicate receipt. I checked the existing expense and want to save another.',{exact:false}).last().scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${name}-03-duplicate-review-required.png`});
 results.cases[name]={viewport,uploadedFiles:4,resumedDrafts:4,expensesBeforeReview:0,savedExpense:expense,duplicateBlockedUntilReview:true,actualAttachmentBytes:png.length,expensePosts};await context.close();
 }assert.deepEqual(errors,[]);await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));console.log('PASS: desktop/phone real API receipt uploads3images+PDF, resumed review drafts, explicit exact115/GST15 save with same attachment, duplicate override required, no page errors');
}finally{await browser.close()}
