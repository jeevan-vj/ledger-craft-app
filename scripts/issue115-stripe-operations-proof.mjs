import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
const origin=process.env.ISSUE115_STRIPE_ORIGIN??'http://127.0.0.1:8080';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname),'Proof must use a local simulator');
const output=process.env.ISSUE115_STRIPE_OUTPUT??'/tmp/ledgercraft-issue115-stripe';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const result={platform:'Chromium web, real local Hono/SQLite with explicit Stripe mock gateway; no real Stripe payment',expected:{gross:'100.00',platformFee:'4.30',netClearing:'95.70',refundRestoresInvoice:'100.00',clearingAfterRefund:'0.00'},errors:[],cases:{}};
let activePage;
try{
for(const [name,viewport] of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}]]){
 const context=await browser.newContext({viewport});const page=await context.newPage();activePage=page;page.setDefaultTimeout(60_000);page.on('pageerror',error=>result.errors.push(`${name}: ${error.message}`));
 async function api(route,body,expected=200){for(let attempt=0;attempt<4;attempt++){const response=await context.request.fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID()},data:body});const text=await response.text();if(route==='/api/auth/sign-up/email'&&response.status()===429&&attempt<3){console.log(`${name}: signup rate window respected; retry in11seconds`);await new Promise(resolve=>setTimeout(resolve,11_000));continue;}assert.equal(response.status(),expected,`${route}: ${text}`);return JSON.parse(text);}}
 async function shot(label,target){if(target)await target.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`${name}-${label}.png`),animations:'disabled'});}
 await api('/api/auth/sign-up/email',{name:'Stripe proof owner',email:`stripe-proof-${name}-${Date.now()}@example.test`,password:`Local-${crypto.randomUUID()}`});
 const profile=await context.request.put(origin+'/api/business-profile',{headers:{Origin:origin},data:{name:`Kauri Stripe ${name} Limited`,email:'owner@example.test',country:'NZ',gstRegistrationStatus:'not_registered'}});assert.equal(profile.status(),200);
 const account=await api('/api/payments/stripe/account',{},201);assert.equal(account.status,'onboarding');
 const onboard=await api('/api/payments/stripe/account/onboarding-link',{platform:'web'});assert.ok(onboard.url.includes('/api/stripe/mock/'),'Real Stripe mode must not be used by this proof');
 await page.goto(onboard.url);await page.getByRole('button',{name:'Complete test onboarding'}).click();
 const customer=await api('/api/customers',{name:'Harbour Services',email:'buyer@example.test'},201);
 const invoice=await api('/api/invoices',{customerId:customer.id,date:'2026-11-07',dueDate:'2026-12-07',currency:'NZD',taxInclusive:false,taxRate:'0',items:[{description:'Reviewed service',quantity:'1',rate:'100'}]},201);
 const link=await api(`/api/invoices/${invoice.id}/payment-links`,{},201);assert.equal(link.platformFee,'4.30');
 await page.goto(link.payUrl);await page.getByRole('button',{name:/Pay with test card/}).click();
 const paidLink=await api(`/api/invoices/${invoice.id}/payment-links/${link.id}`);assert.equal(paidLink.status,'paid');
 const payment=await api(`/api/payments/${paidLink.paymentId}`);
 await page.goto(origin+'/settings?tab=payments',{waitUntil:'networkidle'});await page.evaluate(()=>document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
 const tab=page.getByRole('tab',{name:'Card payments',exact:true});await tab.click();
 await page.getByRole('button',{name:'Review Stripe balances and payments',exact:true}).click();
 const panel=page.getByRole('region',{name:'Stripe balances and payment review'});await panel.getByText('NZD 95.70',{exact:true}).first().waitFor();
 const balance=await api('/api/payments/stripe/balance');assert.equal(balance.ledgerClearing,'95.70');assert.equal(balance.difference,'0.00');await shot('01-balances',panel);
 await panel.getByRole('button',{name:'Verify with Stripe',exact:true}).click();await panel.getByText('match',{exact:true}).waitFor();await shot('02-verified',panel.getByText('match',{exact:true}));
 await panel.getByLabel('Full refund reason').fill('Customer requested full cancellation');await panel.getByLabel('I confirm a full Stripe refund and transfer reversal').check();await panel.getByRole('button',{name:'Request full refund',exact:true}).click();await panel.getByText('Refund requested. Awaiting Stripe webhook confirmation.',{exact:true}).waitFor();await shot('03-refund-awaiting-webhook',panel.getByText('Refund requested. Awaiting Stripe webhook confirmation.',{exact:true}));
 assert.equal((await api(`/api/payments/${paidLink.paymentId}`)).status,'completed');
 const refundEvent={id:`evt_browser_refund_${crypto.randomUUID()}`,type:'charge.refunded',livemode:false,account:null,data:{object:{payment_intent:payment.referenceNumber}}};
 const webhook=await context.request.post(origin+'/api/stripe/webhooks/platform',{headers:{'stripe-signature':'mock_signature'},data:refundEvent});assert.equal(webhook.status(),200,await webhook.text());
 const refunded=await api(`/api/payments/${paidLink.paymentId}`);assert.equal(refunded.status,'refunded');
 const finalInvoice=await api(`/api/invoices/${invoice.id}`);assert.equal(finalInvoice.balanceDue,'100.00');
 const finalBalance=await api('/api/payments/stripe/balance');assert.equal(finalBalance.ledgerClearing,'0.00');assert.equal(finalBalance.difference,'0.00');
 await page.reload({waitUntil:'networkidle'});await page.getByRole('tab',{name:'Card payments',exact:true}).click();await page.getByRole('button',{name:'Review Stripe balances and payments',exact:true}).click();await page.getByText('NZD 100.00 · refunded',{exact:true}).waitFor();await shot('04-refunded-and-restored',page.getByText('NZD 100.00 · refunded',{exact:true}));
 result.cases[name]={invoiceId:invoice.id,paymentId:paidLink.paymentId,before:balance,after:finalBalance,finalInvoiceBalance:finalInvoice.balanceDue,finalPaymentStatus:refunded.status};await context.close();
}
assert.deepEqual(result.errors,[]);await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log('PASS Stripe local simulator: desktop/phone settlement100, fee4.30, clearing95.70, verify match, explicit refund, webhook-only reversal, invoice restored100, clearing0; no page errors');
}catch(error){if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:path.join(output,'failure.png')});console.error((await activePage.locator('body').innerText()).slice(0,12000));}throw error;}finally{await browser.close();}
