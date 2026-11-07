import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.ISSUE115_WEB_ORIGIN ?? 'http://127.0.0.1:8080';
const output = process.env.ISSUE115_WEB_OUTPUT ?? '/tmp/ledgercraft-issue115-gst-web';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
const results = { platform: `Chromium ${process.env.ISSUE115_WEB_MODE ?? 'production-preview'} web: desktop1440x900 and phone390x844`, fixture: 'Real HTTP signup and synthetic source documents; actual GST settings/period preparation/save/file-record/PDF/recalculation UI', expected: { invoiceGst: '135.00', paymentsGst: '141.00', hybridGst: '171.00', recordedAfterChange: '141.00', recalculatedOriginalPayments: '156.00', difference: '15.00', currentHybridAfterChange: '186.00', novemberDueDate: '2027-01-15', octoberDueDate: '2026-11-30' }, errors, cases: {} };
async function run(name, viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(90_000);
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) console.log(name, 'NAVIGATION', frame.url()); });
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  const scenario = { build: await (await context.request.get(`${origin}/version.json`)).json() };
  async function shot(label, target = page) {
    if (viewport.width < 600 && target !== page) await target.evaluate(element => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
    const anchor = target === page ? page.locator('main').first() : target;
    if (await anchor.count()) {
      await anchor.waitFor({ state: 'visible' }); const element = await anchor.elementHandle();
      await page.waitForFunction(node => { if (!node?.isConnected) return false; for (let current = node; current; current = current.parentElement) { if (Number(getComputedStyle(current).opacity) < 0.99) return false; } return true; }, element, { timeout: 15_000 });
    }
    return page.screenshot({ path: path.join(output, `${name}-${label}.png`), animations: 'disabled' });
  }
  async function api(route, method = 'GET', body, expected = 200) {
    const response = await context.request.fetch(`${origin}${route}`, { method, headers: { Origin: origin, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, data: body });
    const raw = await response.text(); assert.equal(response.status(), expected, `${name} ${method} ${route}: ${raw}`);
    return raw ? JSON.parse(raw) : null;
  }
  const post = (route, body, status = 201) => api(route, 'POST', body, status);
  async function settingBasis(basis) {
    await page.goto(`${origin}/tax-config`, { waitUntil: 'networkidle' });
    const form = page.locator('section[aria-label="Registered GST settings"]');
    await form.getByRole('combobox', { name: 'Registered GST basis', exact: true }).selectOption(basis);
    await form.getByLabel('I have checked these settings against my IRD registration').check();
    await form.getByRole('button', { name: 'Save registered GST settings', exact: true }).click();
    await form.getByText('GST settings saved and reloaded', { exact: true }).waitFor();
    const saved = await api('/api/tax/gst-settings'); assert.equal(saved.gstAccountingBasis, basis); return saved;
  }
  async function invoice(customerId, net, receipt) {
    const value = await post('/api/invoices', { customerId, date: '2026-10-02', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Reviewed NZ consulting', quantity: '1', rate: net }] });
    await post('/api/payments', { invoiceId: value.id, amount: receipt, paymentDate: '2026-10-05', paymentMethod: 'bank_transfer' });
    return value;
  }
  try {
    await post('/api/auth/sign-up/email', { name: `GST ${name} Owner`, email: `gst-115-${name}-${Date.now()}@example.test`, password: `Local-${crypto.randomUUID()}` }, 200);
    await api('/api/business-profile', 'PUT', { name: `Kauri GST ${name} Limited`, email: 'owner@gst.example.test', country: 'NZ', gstRegistrationStatus: 'not_registered', defaultTaxRate: '15' });
    await api('/api/me');
    await page.goto(`${origin}/tax-config`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
    const form = page.locator('section[aria-label="Registered GST settings"]');
    await form.getByRole('combobox', { name: 'GST registration status', exact: true }).selectOption('registered');
    await form.getByLabel('IRD GST number', { exact: true }).fill('49-091-850');
    await form.getByLabel('GST registration date', { exact: true }).fill('2026-10-01');
    await form.getByRole('combobox', { name: 'Registered GST basis', exact: true }).selectOption('payments');
    await form.getByRole('combobox', { name: 'GST filing frequency', exact: true }).selectOption('monthly');
    await form.getByRole('combobox', { name: 'IRD taxable-period ending month', exact: true }).selectOption('3');
    assert.equal(await form.getByRole('button', { name: 'Save registered GST settings', exact: true }).isEnabled(), false);
    await form.getByLabel('I have checked these settings against my IRD registration').check();
    await shot('01-reviewed-registered-settings', form);
    if (viewport.width < 600) { await form.getByRole('button', { name: 'Save registered GST settings', exact: true }).scrollIntoViewIfNeeded(); await shot('01b-reviewed-settings-save'); }
    await form.getByRole('button', { name: 'Save registered GST settings', exact: true }).click();
    await form.getByText('GST settings saved and reloaded', { exact: true }).waitFor();
    scenario.settings = await api('/api/tax/gst-settings');
    assert.equal(scenario.settings.gstAccountingBasis, 'payments'); assert.equal(scenario.settings.taxId, '49091850'); assert.equal(scenario.settings.gstRegisteredFrom, '2026-10-01');
    const customer = await post('/api/customers', { name: 'Harbour Cafe', email: 'buyer@example.test' });
    await invoice(customer.id, '1000', '1150'); await invoice(customer.id, '400', '230');
    for (const [amount, taxAmount, gstTreatment] of [['230', '30', 'standard'], ['50', '0', 'exempt']]) await post('/api/expenses', { description: 'Reviewed reference operating cost', amount, taxAmount, gstTreatment, currency: 'NZD', status: 'approved', expenseDate: '2026-10-03' });
    const chart = (await api('/api/accounts')).accounts;
    const expense = chart.find(account => account.accountNumber === '5000'); assert.ok(expense);
    const bank = await post('/api/bank-accounts', { accountName: 'GST Reference Operating', accountNumber: `gst-${crypto.randomUUID()}`, bankName: 'Test Bank', accountType: 'checking', currency: 'NZD' });
    const vendor = await post('/api/vendors', { name: 'Reviewed contractor' });
    const bill = await post('/api/bills', { vendorId: vendor.id, issueDate: '2026-10-03', dueDate: '2026-10-31', taxInclusive: true, currency: 'NZD', lines: [{ description: 'Contractor services', quantity: '1', unitPrice: '345', taxRate: '15', accountId: expense.id }] });
    await post(`/api/bills/${bill.id}/receive`, {}, 200); await post(`/api/bills/${bill.id}/payments`, { bankAccountId: bank.id, amount: '69', paymentDate: '2026-10-05' });
    await settingBasis('invoice');
    scenario.invoiceBasis = await api('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31'); assert.equal(scenario.invoiceBasis.netGstPosition, '135.00');
    await settingBasis('payments');
    scenario.periods = await api('/api/tax/gst-periods');
    const period = scenario.periods.periods.find(value => value.periodStart === '2026-10-01'); assert.equal(period?.dueDate, '2026-11-30');
    assert.equal(scenario.periods.periods.find(value => value.periodStart === '2026-11-01')?.dueDate, '2027-01-15');
    await page.goto(`${origin}/ird-reports`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Prepare 2026-10-01 to 2026-10-31', exact: true }).waitFor();
    await shot('02-server-period-overview');
    await page.getByRole('button', { name: 'Prepare 2026-10-01 to 2026-10-31', exact: true }).click();
    const worksheet = page.locator('section[aria-label="GST worksheet"]');
    assert.equal(await worksheet.getByRole('combobox', { name: 'Registered GST basis', exact: true }).isEnabled(), false);
    assert.equal(await worksheet.getByLabel('GST due date (confirm in myIR)', { exact: true }).inputValue(), '2026-11-30');
    await worksheet.getByRole('button', { name: 'Prepare GST worksheet', exact: true }).click();
    await worksheet.getByText('NZD 141.00', { exact: true }).waitFor();
    const review = worksheet.getByLabel('I have reviewed the adjustment sources and tax treatment', { exact: true });
    if (await review.count()) { await review.check(); await worksheet.getByRole('button', { name: 'Prepare GST worksheet', exact: true }).click(); await worksheet.getByText('NZD 141.00', { exact: true }).waitFor(); }
    await worksheet.getByLabel('I have reviewed the worksheet and bank reconciliation', { exact: true }).check();
    await shot('03-payments-worksheet-141', worksheet);
    if (viewport.width < 600) { await worksheet.getByRole('button', { name: 'Save GST worksheet draft', exact: true }).scrollIntoViewIfNeeded(); await shot('03b-payments-141-review-save'); }
    await worksheet.getByRole('button', { name: 'Save GST worksheet draft', exact: true }).click();
    await worksheet.getByText('GST draft saved and reloaded', { exact: true }).waitFor();
    const rows = (await api('/api/tax-returns')).taxReturns;
    const record = rows.find(value => value.returnType === 'GST'); assert.equal(record.netGst, '141.00');
    assert.equal(record.returnData.gstCalculation.settings.gstAccountingBasis, 'payments'); assert.ok(record.returnData.gstCalculation.fingerprint);
    scenario.saved = record;
    await page.getByRole('button', { name: 'View return 2026-10-01 to 2026-10-31', exact: true }).click();
    const saved = page.locator('section[aria-label="Saved GST return"]');
    await saved.locator(':scope > dl').getByText('NZD 141.00', { exact: true }).waitFor();
    const overflowButtons = await saved.evaluate(section => { const edge = section.getBoundingClientRect().right; return [...section.querySelectorAll('button')].filter(button => button.getBoundingClientRect().right > edge + 1).map(button => button.textContent); });
    assert.deepEqual(overflowButtons, [], 'Saved-return actions must fit within the phone content width');
    await saved.getByText('Calculation and source audit', { exact: true }).click();
    await saved.getByText('Calculation version: gst-ledger-v2', { exact: true }).waitFor();
    await shot('04-saved-source-audit', viewport.width < 600 ? saved.locator('details') : saved);
    const download = page.waitForEvent('download', { timeout: 90_000 });
    await saved.getByRole('button', { name: 'Download GST record PDF', exact: true }).click();
    const pdfPath = path.join(output, `${name}-gst-payments-141.pdf`); await (await download).saveAs(pdfPath);
    assert.equal((await readFile(pdfPath)).subarray(0, 5).toString(), '%PDF-'); assert.ok((await stat(pdfPath)).size > 1000);
    const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' }); assert.ok(text.includes('Payments basis')); assert.ok(text.includes('141.00')); assert.ok(text.includes('gst-ledger-v2'));
    scenario.pdfBytes = (await stat(pdfPath)).size;
    await saved.getByLabel('myIR confirmation reference', { exact: true }).fill(`MYIR-115-${name.toUpperCase()}`);
    await saved.getByLabel('I have already filed this return separately in myIR', { exact: true }).check();
    await saved.getByRole('button', { name: 'Record existing myIR filing', exact: true }).click();
    await saved.getByText('Existing myIR filing recorded', { exact: true }).waitFor();
    scenario.filed = await api(`/api/tax-returns/${record.id}`); assert.equal(scenario.filed.status, 'submitted'); assert.equal(scenario.filed.netGst, '141.00');
    await shot('05-manual-filing-record', saved);
    scenario.hybridSettings = await settingBasis('hybrid');
    scenario.hybridBeforeChange = await api('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31'); assert.equal(scenario.hybridBeforeChange.netGstPosition, '171.00');
    await invoice(customer.id, '100', '115');
    scenario.currentHybrid = await api('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31'); assert.equal(scenario.currentHybrid.netGstPosition, '186.00');
    await page.goto(`${origin}/ird-reports`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'View return 2026-10-01 to 2026-10-31', exact: true }).click();
    const retained = page.locator('section[aria-label="Saved GST return"]');
    await retained.getByRole('button', { name: 'Preview current books using original settings', exact: true }).click();
    const preview = retained.locator('section[aria-label="Current books preview"]');
    await preview.getByText('NZD 156.00', { exact: true }).waitFor(); await preview.getByText('NZD 15.00', { exact: true }).waitFor();
    await preview.getByText(/registered choices have changed/).waitFor();
    await retained.locator(':scope > dl').getByText('NZD 141.00', { exact: true }).waitFor();
    scenario.recalculation = await api(`/api/tax-returns/${record.id}/recalculation`);
    assert.equal(scenario.recalculation.current.basis, 'payments'); assert.equal(scenario.recalculation.current.netGstPosition, '156.00'); assert.equal(scenario.recalculation.difference.netGst, '15.00'); assert.equal(scenario.recalculation.settingsChanged, true);
    scenario.retained = await api(`/api/tax-returns/${record.id}`);
    assert.equal(scenario.retained.returnData.gstCalculation.fingerprint, record.returnData.gstCalculation.fingerprint); assert.equal(scenario.retained.irdReference, scenario.filed.irdReference); assert.equal(scenario.retained.netGst, '141.00');
    await shot('06-readonly-original-basis-recalculation', viewport.width < 600 ? preview : retained);
    results.cases[name] = scenario;
  } catch (error) { await shot('failure'); console.error((await page.locator('body').innerText()).slice(0, 9000)); throw error; }
  finally { await context.close(); }
}
try {
  if (process.env.ISSUE115_WEB_CASE !== 'phone') await run('desktop', { width: 1440, height: 900 });
  if (process.env.ISSUE115_WEB_CASE !== 'desktop') await run('phone', { width: 390, height: 844 });
  assert.deepEqual(errors, []); assert.equal(new Set(Object.values(results.cases).map(value => value.build.hash)).size, 1, 'All cases must use the same built artifact'); await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PASS: actual desktop/phone GST settings, closedOctober30November+November15Januaryperiods, payments141 saved/filed/PDF, hybrid171→186, original-basis readonlyrecalc156 versus saved141 difference15; no page errors');
} finally { await browser.close(); }
