// Read-only report refresh after the additive earnings disclosure. No business mutations.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const out=process.env.CLOSE_OUTPUT??'/tmp/second-month-year-end-web';
const origin='http://127.0.0.1:8080';
const saved=JSON.parse(await readFile(`${out}/state.json`,'utf8'));
const paper=JSON.parse(await readFile('docs/evidence/second-month-year-end/expected.json','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({storageState:`${out}/session.json`,viewport:{width:1440,height:900},timezoneId:'Pacific/Auckland',acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(25000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push({message:m.text(),location:m.location()});});
const fields=['trialBalance','profitLoss','balanceSheet','cashFlow','receivablesAging','payablesAging','taxSummary'];
async function api(path){const response=await context.request.get(origin+path);assert.equal(response.status(),200,await response.text());return response.json();}
async function compareOriginal(key,from,to,earnings){
 const fresh=await api(`/api/reports/financial?from=${from}&to=${to}&basis=accrual`);
 for(const field of fields){const before=structuredClone(saved[key][field]);const after=structuredClone(fresh[field]);if(field==='balanceSheet'){delete before.accumulatedEarnings;delete after.accumulatedEarnings;}assert.deepEqual(after,before,`${key}.${field}: all original financial fields unchanged`);}
 assert.equal(fresh.balanceSheet.accumulatedEarnings,earnings);return fresh;
}
try{
 const reportBuild=await api('/version.json');assert.notEqual(reportBuild.hash,saved.build.hash,'Report display was rebuilt after the business-operation artifact');
 saved.preBridgeBuild=saved.build;saved.reportBuild=reportBuild;saved.earningsRefresh={apiFixtureWrites:false,originalFinancialFieldsUnchanged:true,periods:[]};
 saved.report=await compareOriginal('report','2026-10-01','2026-10-31','1500.00');
 for(const [key,period]of [['novemberReport','november'],['yearEndReport','yearEnd'],['aprilReport','april']]){
  const expected=paper[period],from=expected.period.from,to=expected.period.to;const earnings=expected.balanceSheet.accumulatedEarnings;
  saved[key]=await compareOriginal(key,from,to,earnings);await page.goto(`${origin}/financial-reports?from=${from}&to=${to}`,{waitUntil:'networkidle'});await page.evaluate(()=>document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
  const values=[['Profit & loss','profit-loss',expected.profitLoss.accrual.netIncome],['Trial balance','trial-balance',expected.closingTrialBalance.totalDebits],['Balance sheet','balance-sheet',expected.balanceSheet.assets],['Cash flow','cash-flow',expected.balanceSheet.cash],['Receivables','receivables-aging',expected.receivablesAging.total],['Payables','payables-aging',expected.payablesAging.total]];
  for(const[tab,file,value]of values){
   await page.getByRole('tab',{name:tab,exact:true}).click();await expect(page.getByRole('tabpanel')).toContainText(new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD'}).format(value));
   if(tab==='Balance sheet')await expect(page.getByText(/^Accumulated earnings \(included in equity\)/)).toContainText(new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD'}).format(earnings));
   await page.getByRole('tabpanel').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${key}-${file}.png`,animations:'disabled'});
   for(const[button,suffix]of [['Download PDF','pdf'],['Export CSV','csv']]){const pending=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();await(await pending).saveAs(`${out}/${key}-${file}.${suffix}`);}
   await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:tab,exact:true}).click();
   if(tab==='Balance sheet')await expect(page.getByText(/^Accumulated earnings \(included in equity\)/)).toContainText(new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD'}).format(earnings));
   await page.getByRole('tabpanel').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${key}-phone-${file}.png`,animations:'disabled'});await page.setViewportSize({width:1440,height:900});
  }
  const panel=page.locator('section[aria-label="Accountant close pack"]');const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Download accountant close pack',exact:true}).click();await(await download).saveAs(`${out}/${key}-close-pack.zip`);await panel.getByRole('status').waitFor();await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${key}-pack-after-close.png`,animations:'disabled'});
  saved.earningsRefresh.periods.push({key,from,to,accumulatedEarnings:earnings,originalFieldsUnchanged:true});
 }
 assert.deepEqual(errors,[]);saved.earningsRefresh.unexpectedBrowserErrors=errors;await writeFile(`${out}/state.json`,JSON.stringify(saved,null,2));console.log('PASS final web earnings readout: 3 periods,18 PDFs/18 CSVs,3 ZIPs; every original financial field unchanged');
}finally{await browser.close();}
