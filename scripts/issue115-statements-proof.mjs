import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const origin=process.env.COLLECTIONS_ORIGIN??'http://127.0.0.1:8080';
const output=process.env.COLLECTIONS_OUTPUT??'/tmp/ledgercraft-remaining-statements';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
let activePage;
const result={platform:'Chromium responsive web with real local Hono/SQLite and synthetic registered companies; no real mail delivery',expected:{opening:'230.00',closing:'690.00',current:'460.00',days31To60:'230.00',afterLateReceipt:'575.00'},errors:[],cases:{}};
try { for(const [name,viewport] of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}]]) {
 const context=await browser.newContext({viewport,acceptDownloads:true});const page=await context.newPage();activePage=page;page.setDefaultTimeout(60000);page.on('pageerror',error=>result.errors.push(`${name}: ${error.message}`));
 async function api(path,method='GET',data,status=200){let response;for(let attempt=0;attempt<4;attempt++){response=await context.request.fetch(origin+path,{method,data,headers:{Origin:origin,...(method==='POST'?{'Idempotency-Key':crypto.randomUUID()}:{})}});if(response.status()!==429||path!=='/api/auth/sign-up/email')break;await new Promise(resolve=>setTimeout(resolve,11000));}const text=await response.text();assert.equal(response.status(),status,`${path}: ${text}`);return text?JSON.parse(text):null;}
 async function shot(label,locator){if(locator)await locator.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${name}-${label}.png`,animations:'disabled'});}
 await api('/api/auth/sign-up/email','POST',{name:'Collections reviewer',email:`collections-${crypto.randomUUID()}@example.test`,password:`Local-${crypto.randomUUID()}`});
 await api('/api/business-profile','PUT',{name:`Kauri Statements ${name} Limited`,email:'owner@example.test',country:'NZ',gstRegistrationStatus:'registered',taxId:'49091850',gstRegisteredFrom:'2026-01-01',gstAccountingBasis:'invoice',gstFilingFrequency:'two_monthly',gstPeriodAnchor:10});
 const customer=await api('/api/customers','POST',{name:'Harbour Services',email:'buyer@example.test',phone:'0215550100'},201);
 async function invoice(date,net,dueDate){const value=await api('/api/invoices','POST',{customerId:customer.id,date,dueDate,currency:'NZD',taxInclusive:false,taxRate:'15',items:[{description:'Reviewed professional services',quantity:'1',rate:net}]},201);await api(`/api/invoices/${value.id}`,'PATCH',{status:'sent'});return value;}
 await invoice('2026-09-01','200','2026-09-30');const sale=await invoice('2026-10-02','1000','2026-10-31');
 await api('/api/payments','POST',{invoiceId:sale.id,amount:'575.00',paymentMethod:'bank_transfer',paymentDate:'2026-10-10'},201);
 await api('/api/credit-notes','POST',{invoiceId:sale.id,issueDate:'2026-10-15',reason:'Reviewed service reduction',taxInclusive:false,taxRate:'15',items:[{description:'Service reduction',quantity:'1',rate:'100'}]},201);
 await page.goto(origin+'/customers',{waitUntil:'networkidle'});await page.evaluate(()=>document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
 await page.getByRole('link',{name:'Statement for Harbour Services',exact:true}).first().click();
 await page.getByLabel('Statement type',{exact:true}).selectOption('activity');await page.getByLabel('Statement from',{exact:true}).fill('2026-10-01');await page.getByLabel('Statement to',{exact:true}).fill('2026-10-31');await page.getByRole('button',{name:'Preview statement',exact:true}).click();
 const statement=page.getByRole('region',{name:'Customer statement'}); // section has an accessible name
 await statement.getByText('690.00',{exact:true}).first().waitFor();
 const stored=await api(`/api/customers/${customer.id}/statement?type=activity&from=2026-10-01&to=2026-10-31`);assert.equal(stored.openingBalance,'230.00');assert.equal(stored.closingBalance,'690.00');assert.equal(stored.aging.current,'460.00');assert.equal(stored.aging.days31To60,'230.00');
 await shot('01-activity-and-aging',statement);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download statement PDF',exact:true}).click();const file=await download;const pdfPath=`${output}/${name}-statement-690.pdf`;await file.saveAs(pdfPath);const pdfText=execFileSync('pdftotext',[pdfPath,'-'],{encoding:'utf8'});assert.ok(pdfText.includes('690.00'));assert.ok(pdfText.includes('Harbour Services'));
 await page.getByRole('button',{name:'Create statement share link',exact:true}).click();const shared=page.locator('a[href*="/shared/statement/"]');await shared.waitFor();const url=await shared.getAttribute('href');assert.ok(url.startsWith(origin));
 await shot('02-share-and-delivery-unavailable',shared);
 const token=new URL(url).pathname.split('/').pop();const original=await api(`/api/public/customer-statements/${token}`);assert.equal(original.closingBalance,'690.00');
 await api('/api/payments','POST',{invoiceId:sale.id,amount:'115.00',paymentMethod:'bank_transfer',paymentDate:'2026-10-31'},201);const revised=await api(`/api/customers/${customer.id}/statement?type=activity&from=2026-10-01&to=2026-10-31`);assert.equal(revised.closingBalance,'575.00');assert.deepEqual(await api(`/api/public/customer-statements/${token}`),original);
 const publicContext=await browser.newContext({viewport});const publicPage=await publicContext.newPage();await publicPage.goto(url,{waitUntil:'networkidle'});await publicPage.getByText('690.00',{exact:true}).first().waitFor();assert.equal(await publicPage.locator('meta[name="referrer"]').getAttribute('content'),'no-referrer');await publicPage.screenshot({path:`${output}/${name}-03-public-retained-690.png`,animations:'disabled'});await publicContext.close();
 await page.goto(origin+'/payment-reminders',{waitUntil:'networkidle'});await page.getByRole('checkbox',{name:'Enable automatic reminders',exact:true}).check();await page.getByRole('button',{name:'Save reminder schedule',exact:true}).click();await page.getByText('Reminder schedule saved',{exact:true}).waitFor();await shot('04-saved-schedule',page.getByRole('checkbox',{name:'Enable automatic reminders',exact:true}));
 const settings=await api('/api/payment-reminders/settings');assert.equal(settings.enabled,true);assert.equal(settings.emailAvailable,false);await page.reload({waitUntil:'networkidle'});await page.getByRole('checkbox',{name:'Enable automatic reminders',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'Enable automatic reminders',exact:true}).isChecked(),true);
 await page.goto(origin+`/invoices/${sale.id}`,{waitUntil:'networkidle'});const panel=page.locator('section[aria-label="Invoice reminders"]');await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname===`/api/payment-reminders/invoices/${sale.id}`&&response.request().method()==='PUT'),panel.getByRole('checkbox').click()]);assert.equal((await api(`/api/payment-reminders/invoices/${sale.id}`)).optOut,true);await page.waitForFunction(()=>document.querySelector('section[aria-label="Invoice reminders"] input')?.checked===true);await shot('05-invoice-reminder-opt-out',panel);
 result.cases[name]={build:await(await context.request.get(origin+'/version.json')).json(),statement:stored,revisedClosing:revised.closingBalance,publicRetainedClosing:original.closingBalance,settings,pdfText};await context.close();
 }
 assert.deepEqual(result.errors,[]);await writeFile(`${output}/results.json`,JSON.stringify(result,null,2));console.log('PASS: statements opening230/closing690/aging460+230, PDF, anonymous retained690 after late receipt current575, reminder save/reload and invoice opt-out on desktop/phone');
} catch(error) {if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:`${output}/failure.png`});await writeFile(`${output}/failure.txt`,await activePage.locator('body').innerText());}throw error;} finally {await browser.close();}
