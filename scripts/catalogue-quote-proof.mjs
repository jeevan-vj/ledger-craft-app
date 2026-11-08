import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { freshProofDirectory, proofBrowserOptions, localProofOrigin } from './proof-runtime.mjs';
const origin=localProofOrigin(process.env.CLOSE_WEB_URL??'http://127.0.0.1:8080');
const out=await freshProofDirectory(process.env.PROOF_OUTPUT);console.log(`Proof output: ${out}`);assert.ok(process.env.PROOF_SESSION);
const browser=await chromium.launch(proofBrowserOptions());
const context=await browser.newContext({storageState:process.env.PROOF_SESSION,viewport:{width:1440,height:900},timezoneId:'Pacific/Auckland'});
const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
const name=`Verification service ${Date.now()}`;
async function api(path){const r=await context.request.get(origin+path);assert.equal(r.status(),200);return r.json();}
async function go(path){await page.goto(origin+path,{waitUntil:'networkidle'});await page.evaluate(()=>document.querySelector('[aria-label="Dismiss update prompt"]')?.click());}
async function shot(label){await page.waitForLoadState('networkidle');await page.screenshot({path:`${out}/${label}.png`,animations:'disabled'});}
async function response(path,method,action){const wait=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()===method);await action();const r=await wait;assert.ok(r.ok(),await r.text());return r.json();}
try{
 const before=await api('/api/reports/financial?from=2026-01-01&to=2026-12-31&basis=accrual');
 await go('/items');await page.getByRole('button',{name:/^Add (an )?Item\b/i}).first().click();
 const d=page.getByRole('dialog');await d.getByLabel('Item Name *',{exact:true}).fill(name);await d.getByLabel('Service',{exact:true}).check();
 await d.getByLabel('Sale Price *',{exact:true}).fill('100');await d.getByLabel('Tax Rate (%)',{exact:true}).fill('15');
 const item=await response('/api/items','POST',()=>d.getByRole('button',{name:'Save',exact:true}).click());await expect(d).not.toBeVisible();
 await page.reload({waitUntil:'networkidle'});await page.getByText(name,{exact:true}).first().waitFor();assert.match(String((await api(`/api/items/${item.id}`)).salePrice),/^100(?:\.0{1,2})?$/);await shot('01-catalogue-created');
 const row=page.getByRole('row').filter({hasText:name});await row.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Edit',exact:true}).click();
 await d.getByLabel('Sale Price *',{exact:true}).fill('125');await response(`/api/items/${item.id}`,'PATCH',()=>d.getByRole('button',{name:'Save',exact:true}).click());await expect(d).not.toBeVisible();
 await page.reload({waitUntil:'networkidle'});assert.match(String((await api(`/api/items/${item.id}`)).salePrice),/^125(?:\.0{1,2})?$/);await page.setViewportSize({width:390,height:844});await shot('02-catalogue-edited-phone');
 await page.setViewportSize({width:1440,height:900});await go('/quotes/new');await page.getByTitle('Add new customer',{exact:true}).click();const f=page.locator('#customer-form');await f.getByLabel(/^Name/).fill('Quote verification customer');await f.getByLabel(/^Email/).fill('quote-review@example.test');await page.getByRole('button',{name:'Create Customer',exact:true}).click();await page.getByTestId('customer-select').filter({hasText:'Quote verification customer'}).waitFor();
 await page.getByTestId('item-description-0').fill('Reviewed quote service');await page.getByTestId('item-quantity-0').fill('1');await page.getByTestId('item-rate-0').fill('100');await page.getByRole('switch',{name:'Prices include GST',exact:true}).uncheck();
 const quote=await response('/api/quotes','POST',()=>page.locator('[data-testid="save-invoice-button"]:visible').click());assert.equal(quote.total,'115.00');await go(`/quotes/${quote.id}`);await page.getByRole('button',{name:'Mark sent',exact:true}).click();await page.getByRole('button',{name:'Mark accepted',exact:true}).waitFor();await shot('03-quote-sent');
 await page.getByRole('button',{name:'Mark accepted',exact:true}).click();await page.getByRole('dialog').getByLabel('Response name').fill('Synthetic buyer');await page.getByRole('dialog').getByRole('button',{name:'Mark accepted',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'Convert to invoice',exact:true})).toBeEnabled();
 const converted=await response(`/api/quotes/${quote.id}/convert`,'POST',()=>page.getByRole('button',{name:'Convert to invoice',exact:true}).click());assert.equal(converted.invoice.status,'draft');assert.equal(converted.invoice.total,'115.00');await page.waitForURL(`**/invoices/${converted.invoice.id}`);const number=page.getByText(converted.invoice.invoiceNumber,{exact:false}).filter({visible:true}).first();await number.waitFor();await expect(page.getByText('Invoice not found.',{exact:true})).not.toBeVisible();await number.scrollIntoViewIfNeeded();await shot('04-converted-draft');
 await page.reload({waitUntil:'networkidle'});await page.setViewportSize({width:390,height:844});await number.scrollIntoViewIfNeeded();await shot('05-converted-draft-phone');
 const after=await api('/api/reports/financial?from=2026-01-01&to=2026-12-31&basis=accrual');assert.deepEqual(after.trialBalance,before.trialBalance);assert.deepEqual(errors,[]);
 await writeFile(`${out}/results.json`,JSON.stringify({platform:'real Vite web/Hono/SQLite',itemId:item.id,editedPrice:'125',quoteId:quote.id,quoteTotal:quote.total,invoiceId:converted.invoice.id,invoiceStatus:converted.invoice.status,ledgerUnchanged:true,errors},null,2));console.log('PASS catalogue create/edit/reload and quote create/sent/accepted/converted draft; no ledger change');
}catch(e){console.error('Primary proof failure:',e);await page.screenshot({path:`${out}/failure.png`});console.error(await page.locator('body').innerText());throw e;}finally{await browser.close();}
