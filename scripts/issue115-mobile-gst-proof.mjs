import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const origin = process.env.ISSUE115_MOBILE_URL ?? 'http://127.0.0.1:8081';
const apiOrigin = process.env.ISSUE115_API_URL ?? 'http://127.0.0.1:3001';
const out = process.env.ISSUE115_MOBILE_OUTPUT ?? '/tmp/ledgercraft-issue115-mobile-gst';
for (const url of [origin, apiOrigin]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const results = { platform: 'Expo web / Chromium 390x844 / Pacific-Auckland timezone; real local Hono/SQLite', fixture: 'Synthetic companies and synthetic external myIR references. No real IRD submission or native device execution.', cases: [], errors: [] };
let activePage;
try {
 for (const [basis, expected, label] of [['payments', '45.00', 'Payments'], ['hybrid', '120.00', 'Hybrid'], ['invoice', '105.00', 'Invoice']]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, colorScheme: 'dark', timezoneId: 'Pacific/Auckland' });
  const page = await context.newPage(); activePage = page; page.setDefaultTimeout(90_000); page.on('pageerror', e => results.errors.push(`${basis}: ${e.message}`));
  async function api(route, method = 'GET', data, status = 200) {
   const response = await context.request.fetch(`${apiOrigin}${route}`, { method, data, headers: { Origin: origin, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) } });
   assert.equal(response.status(), status, `${method} ${route}: ${await response.text()}`); return response.status() === 204 ? null : response.json();
  }
  const shot = async (name, target) => { if (target) await target.evaluate(e => e.scrollIntoView({ block: 'center' })); await page.screenshot({ path: `${out}/${basis}-${name}.png`, animations: 'disabled' }); };
  await api('/api/auth/sign-up/email', 'POST', { name: 'GST Mobile Reviewer', email: `gst115-${basis}-${crypto.randomUUID()}@example.test`, password: `Local-${crypto.randomUUID()}` });
  await api('/api/business-profile', 'PUT', { name: `GST115 Synthetic ${label}`, email: 'owner@example.test', country: 'NZ', gstRegistrationStatus: 'unknown', defaultTaxRate: '15' });
  async function openReports() { await page.goto(origin, { waitUntil: 'networkidle', timeout: 120_000 }); await page.getByText('More', { exact: true }).last().click(); await page.getByText('Financial reports', { exact: true }).last().click(); }
  await openReports();
  await page.getByText('GST settings and returns', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'GST registered', exact: true }).click();
  await page.getByLabel('NZ GST number', { exact: true }).fill('49-091-850'); await page.getByLabel('GST registered from', { exact: true }).fill('2026-10-01');
  await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('button', { name: 'Two-monthly', exact: true }).click();
  await page.getByLabel('GST period ending month (1 to 12)', { exact: true }).fill('10');
  await shot('01-reviewed-settings', page.getByLabel('GST registered from', { exact: true }));
  const settingsResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/tax/gst-settings' && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save GST settings', exact: true }).click(); const settingsHttp = await settingsResponse; assert.equal(settingsHttp.status(), 200); const settings = await settingsHttp.json(); assert.equal(settings.gstAccountingBasis, basis); assert.equal(settings.taxId, '49091850'); assert.equal(settings.configured, true);
  const customer = await api('/api/customers', 'POST', { name: 'Synthetic GST buyer', email: 'buyer@example.test' }, 201);
  const invoice = await api('/api/invoices', 'POST', { customerId: customer.id, date: '2026-10-03', dueDate: '2026-10-31', taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: 'Consulting', quantity: '1', rate: '1000' }] }, 201);
  await api(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
  await api('/api/payments', 'POST', { invoiceId: invoice.id, amount: '575.00', paymentDate: '2026-10-10', paymentMethod: 'bank_transfer' }, 201);
  await api('/api/expenses', 'POST', { description: 'Paid standard cost', amount: '115.00', taxAmount: '15.00', gstTreatment: 'standard', currency: 'NZD', status: 'approved', expenseDate: '2026-10-12' }, 201);
  const chart = (await api('/api/accounts')).accounts; const cost = chart.find(a => a.accountNumber === '5000'); assert.ok(cost);
  const bank = await api('/api/bank-accounts', 'POST', { accountName: 'GST supplier bank', accountNumber: crypto.randomUUID(), bankName: 'Test Bank', accountType: 'checking', currency: 'NZD' }, 201);
  const vendor = await api('/api/vendors', 'POST', { name: 'GST supplier' }, 201);
  const bill = await api('/api/bills', 'POST', { vendorId: vendor.id, issueDate: '2026-10-05', dueDate: '2026-10-31', taxInclusive: false, currency: 'NZD', lines: [{ description: 'Supplier service', quantity: '1', unitPrice: '200.00', taxRate: '15', accountId: cost.id }] }, 201);
  await api(`/api/bills/${bill.id}/receive`, 'POST', {}); await api(`/api/bills/${bill.id}/payments`, 'POST', { bankAccountId: bank.id, amount: '115.00', paymentDate: '2026-10-15' }, 201);
  const periods = await api('/api/tax/gst-periods'); const period = periods.periods.find(p => p.periodStart === '2026-10-01' && p.periodEnd === '2026-10-31'); assert.ok(period);
  await openReports(); await page.getByText(`Registered basis: ${label}`, { exact: true }).waitFor();
  await shot('02-periods', page.getByText('2026-10-01 to 2026-10-31', { exact: true }));
  await page.getByRole('button', { name: 'Prepare this GST period', exact: true }).first().click(); await page.getByText(`Registered GST basis: ${label}`, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Prepare GST figures', exact: true }).click(); await page.getByText(`Net GST payable: $${expected}`, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Review GST adjustments', exact: true }).click(); await page.getByRole('switch', { name: 'Confirm GST adjustment review', exact: true }).click();
  await page.getByRole('button', { name: 'Apply reviewed GST adjustments', exact: true }).click(); await page.getByText('Reviewed adjustments recorded: 0', { exact: true }).waitFor();
  await shot('03-calculated-gst', page.getByText(`Net GST payable: $${expected}`, { exact: true }));
  const saveResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/tax-returns' && r.request().method() === 'POST'); await page.getByRole('button', { name: 'Save GST draft', exact: true }).click();
  const saveHttp = await saveResponse; assert.equal(saveHttp.status(), 201, await saveHttp.text()); const saved = await saveHttp.json(); assert.equal(saved.netGst, expected); assert.equal(saved.returnData.gstCalculation.settings.gstAccountingBasis, basis); assert.match(saved.returnData.gstCalculation.fingerprint, /^[a-f0-9]{64}$/);
  await page.getByRole('button', { name: 'View saved return', exact: true }).first().click(); await page.getByText(`Saved net GST: $${expected}`, { exact: true }).waitFor();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Share GST preparation PDF', exact: true }).click(); const file = await download; const pdfPath = `${out}/${basis}-draft-gst.pdf`; await file.saveAs(pdfPath); const bytes = await readFile(pdfPath); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); assert.ok(bytes.length > 1000);
  const reference = `SYNTHETIC-MYIR-${basis.toUpperCase()}-${expected}`; await page.getByLabel('myIR confirmation reference', { exact: true }).fill(reference); await page.getByRole('switch', { name: 'Confirm this return was filed externally in myIR', exact: true }).click();
  const fileResponse = page.waitForResponse(r => new URL(r.url()).pathname === `/api/tax-returns/${saved.id}/file` && r.request().method() === 'POST'); await page.getByRole('button', { name: 'Record external filing', exact: true }).click(); const filedHttp = await fileResponse; assert.equal(filedHttp.status(), 200, await filedHttp.text()); const filed = await filedHttp.json(); assert.equal(filed.status, 'submitted'); assert.equal(filed.irdReference, reference);
  await openReports(); await page.getByText(new RegExp(`Filed externally.*${reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)).waitFor(); await shot('04-filed-record', page.getByText('2026-10-01 to 2026-10-31', { exact: true }));
  await page.getByRole('button', { name: 'View saved return', exact: true }).first().click(); await page.getByText(`Filed externally · ${reference}`, { exact: true }).waitFor();
  const filedDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Share GST preparation PDF', exact: true }).click(); const filedFile = await filedDownload; const filedPdfPath = `${out}/${basis}-filed-gst.pdf`; await filedFile.saveAs(filedPdfPath); assert.equal((await readFile(filedPdfPath)).subarray(0, 5).toString(), '%PDF-');
  await shot('05-filed-return-detail', page.getByText(`Filed externally · ${reference}`, { exact: true }));
  await api(`/api/tax-returns/${saved.id}`, 'PATCH', { netGst: '999.00' }, 409);
  results.cases.push({ basis, expectedNetGst: expected, settings, period, draft: saved, filed, pdf: pdfPath.split('/').pop(), filedPdf: filedPdfPath.split('/').pop(), immutableFiledReturn: true }); await context.close();
 }
 assert.deepEqual(results.errors, []); await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2)); console.log('PASS: Expo GST settings/periods/preparation payments45/hybrid120/invoice105, canonical draft fingerprint, real PDF downloads, externally-filed record reload and immutability; no page errors.');
} catch (error) { if (activePage && !activePage.isClosed()) { await activePage.screenshot({ path: `${out}/failure.png` }); console.error((await activePage.locator('body').innerText()).slice(0, 12000)); } throw error; } finally { await browser.close(); }
