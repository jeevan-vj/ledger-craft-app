import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

// API-seeded accounting fixture; every GST preparation/save/reload/export action is real web UI.
const origin = process.env.BUSINESS_WEB_URL ?? 'http://127.0.0.1:8080';
const output = process.env.BUSINESS_GST_OUTPUT ?? '/tmp/ledgercraft-business-gst';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function api(route, method = 'GET', body, expected = 200) {
  const response = await context.request.fetch(`${origin}${route}`, { method, headers: { Origin: origin }, data: body });
  assert.equal(response.status(), expected, `${method} ${route}: ${await response.text()}`);
  return response.json();
}
const shot = (name) => page.screenshot({ path: path.join(output, name), animations: 'disabled' });
try {
  await api('/api/auth/sign-up/email', 'POST', { name: 'GST Accountant', email: `gst-business-${Date.now()}@example.test`, password: `Local-${crypto.randomUUID()}` });
  await api('/api/business-profile', 'PUT', { name: 'Kauri GST Reference Limited', email: 'owner@reference.example.test', country: 'NZ', gstRegistrationStatus: 'registered', defaultTaxRate: '15' });
  const customer = await api('/api/customers', 'POST', { name: 'Harbour Cafe', email: 'cafe@example.test' }, 201);
  const expenseAccount = await api('/api/accounts', 'POST', { name: 'Operating costs', accountNumber: '5101', type: 'expense', accountClass: 'expense' }, 201);
  for (const [amount, paid] of [['1000', '1150'], ['400', '230']]) {
    const invoice = await api('/api/invoices', 'POST', { customerId: customer.id, date: '2026-04-10', dueDate: '2026-04-30', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Advisory services', quantity: '1', rate: amount }] }, 201);
    await api('/api/payments', 'POST', { invoiceId: invoice.id, amount: paid, paymentDate: '2026-04-20', paymentMethod: 'bank_transfer' }, 201);
  }
  for (const [amount, taxAmount, gstTreatment] of [['230', '30', 'standard'], ['50', '0', 'exempt']]) {
    await api('/api/expenses', 'POST', { description: 'Business cost', amount, taxAmount, gstTreatment, expenseDate: '2026-04-12', currency: 'NZD', status: 'approved', paymentMethod: 'bank_transfer' }, 201);
  }
  // Unposted cost must never inflate the GST claim.
  await api('/api/expenses', 'POST', { description: 'Unapproved distractor', amount: '1150', taxAmount: '150', gstTreatment: 'standard', expenseDate: '2026-04-12', currency: 'NZD', status: 'pending' }, 201);
  const vendor = await api('/api/vendors', 'POST', { name: 'Subcontractor' }, 201);
  const bill = await api('/api/bills', 'POST', { vendorId: vendor.id, issueDate: '2026-04-15', dueDate: '2026-04-30', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Subcontractor work', quantity: '1', unitPrice: '345', taxRate: '15', accountId: expenseAccount.id }] }, 201);
  await api(`/api/bills/${bill.id}/receive`, 'POST', {});
  const preparation = await api('/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30');
  assert.equal(preparation.totalSales, '1610.00');
  assert.equal(preparation.totalPurchases, '625.00');
  assert.equal(preparation.gstOnSales, '210.00');
  assert.equal(preparation.gstOnPurchases, '75.00');
  assert.equal(preparation.netGstPosition, '135.00');
  await page.goto(`${origin}/ird-reports`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'New GST Return', exact: true }).first().click();
  await page.getByRole('combobox').nth(1).waitFor();
  await page.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'Custom dates (monthly, two-monthly or six-monthly)' }).click();
  await page.getByLabel('Period start', { exact: true }).fill('2026-04-01');
  await page.getByLabel('Period end', { exact: true }).fill('2026-04-30');
  await page.getByLabel('Due date (confirm in myIR)', { exact: true }).fill('2026-05-28');
  await page.getByRole('button', { name: 'Load registered period', exact: true }).click();
  await page.getByText('Loading transaction data for the selected period...').waitFor({ state: 'hidden' });
  await shot('01-registered-period.png');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.getByLabel('Total Sales (including GST)').inputValue(), '1610');
  assert.equal(await page.getByLabel('GST on Sales', { exact: true }).inputValue(), '210');
  await shot('02-output-gst.png');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.getByLabel('Total Purchases (including GST)').inputValue(), '625');
  assert.equal(await page.getByLabel('GST on Purchases', { exact: true }).inputValue(), '75');
  await shot('03-input-gst-includes-bill.png');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByText('Checking bank reconciliation coverage').waitFor({ state: 'hidden' });
  await shot('04-reconciliation.png');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await shot('05-gst-review.png');
  const saveResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/tax-returns');
  await page.getByRole('button', { name: 'Save GST Return', exact: true }).click();
  const savedResponse = await saveResponse;
  assert.equal(savedResponse.status(), 201);
  const saved = await savedResponse.json();
  assert.equal(saved.status, 'draft');
  assert.equal(saved.netGst, '135.00');
  assert.equal(saved.gstOnPurchases, '75.00');
  assert.equal(saved.returnData.preparation.dueDate, '2026-05-28');
  assert.notEqual(saved.returnData.reconciliation?.status, undefined);
  await page.reload({ waitUntil: 'networkidle' });
  const persisted = (await api('/api/tax-returns')).taxReturns.find((row) => row.id === saved.id);
  assert.equal(persisted.returnData.preparation.dueDate, '2026-05-28');
  assert.equal(persisted.status, 'draft');
  await page.getByRole('button', { name: /Download GST return for 2026-04-01 to 2026-04-30/ }).waitFor();
  await shot('06-persisted-gst-draft.png');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download GST return for 2026-04-01 to 2026-04-30/ }).click();
  const download = await downloaded;
  const pdfPath = path.join(output, 'gst-preparation.pdf');
  await download.saveAs(pdfPath);
  const pdf = await readFile(pdfPath);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('07-gst-draft-phone.png');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ seed: 'API reference fixture; real web preparation/save/reload/PDF', preparation, draft: saved, pdfBytes: pdf.length, errors, submittedToIRD: false }, null, 2));
  console.log('PASS: posted GST210/input75/net135, registered dates, draft save/reload, PDF, no IRD submission');
} catch (error) {
  await shot('failure.png');
  console.error((await page.locator('body').innerText()).slice(0, 7000));
  throw error;
} finally { await browser.close(); }
