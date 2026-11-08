import { proofBrowserOptions } from './proof-runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

// Synthetic companies/source documents/rates are real HTTP seeded. Revaluation
// preview/review/post and both foreign settlements are actual web UI actions.
const origin = process.env.BUSINESS_WEB_URL ?? 'http://127.0.0.1:8080';
const output = process.env.COMPLETION_FX_OUTPUT ?? '/tmp/ledgercraft-accounting-completion-fx-web';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
await mkdir(output, { recursive: true });
const browser = await chromium.launch(proofBrowserOptions());
const errors = [];
const results = { platform: 'Chromium production-preview web, 1440x900 and 390x844', seed: 'Real HTTP signup/source documents/reviewed rates; actual web revaluation and invoice/bill settlements', expected: { receivable: { carrying: '160.00', closing: '170.00', unrealizedGain: '10.00', nextDay: '160.00', settledCash: '165.00', realizedGain: '5.00', remaining: '0.00' }, payable: { carrying: '160.00', closing: '170.00', unrealizedLoss: '10.00', nextDay: '160.00', cashOutflow: '165.00', closingCash: '-165.00', realizedLoss: '5.00', remaining: '0.00' } }, errors };
async function fixture(kind) {
  const context = await browser.newContext({ viewport: kind === 'receivable' ? { width: 1440, height: 900 } : { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(25_000);
  page.on('pageerror', (error) => errors.push(`${kind}: ${error.message}`));
  async function api(route, method = 'GET', body, expected = 200) {
    const response = await context.request.fetch(`${origin}${route}`, { method, headers: { Origin: origin, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, data: body });
    assert.equal(response.status(), expected, `${kind}: ${method} ${route}: ${await response.text()}`);
    return response.status() === 204 ? null : response.json();
  }
  const post = (route, body, status = 201) => api(route, 'POST', body, status);
  await post('/api/auth/sign-up/email', { name: `FX ${kind} Accountant`, email: `completion-fx-${kind}-${Date.now()}@example.test`, password: `Local-${crypto.randomUUID()}` }, 200);
  await api('/api/business-profile', 'PUT', { name: `Kauri FX ${kind} Reference`, email: 'owner@fx-reference.example.test', country: 'NZ', defaultTaxRate: '0' });
  await api('/api/me');
  await api('/api/currency-settings');
  const rates = {};
  for (const [name, effectiveDate, rate] of [['source', '2026-10-01', '1.60'], ['closing', '2026-10-31', '1.70'], ['settlement', '2026-11-02', '1.65']]) {
    const settings = await post('/api/exchange-rates', { currencyCode: 'USD', effectiveDate, rate });
    rates[name] = settings.rates.find((entry) => entry.currencyCode === 'USD' && entry.effectiveDate === effectiveDate);
    assert.ok(rates[name]);
  }
  const bank = await post('/api/bank-accounts', { accountName: 'FX Operating NZD', accountNumber: `fx-${crypto.randomUUID()}`, bankName: 'Test Bank', accountType: 'checking', currency: 'NZD' });
  const report = (from, to) => api(`/api/reports/financial?from=${from}&to=${to}&basis=accrual&baseCurrency=NZD`);
  const shot = (name, target = page) => target.screenshot({ path: path.join(output, name), animations: 'disabled' });
  return { context, page, api, post, rates, bank, report, shot };
}
async function revalue(f, kind, documentNumber) {
  await f.page.goto(`${origin}/settings?tab=currency`, { waitUntil: 'networkidle' });
  const panel = f.page.locator('section[aria-labelledby="fx-revaluation-heading"]');
  await panel.getByLabel('FX valuation date', { exact: true }).fill('2026-10-31');
  await panel.getByLabel('FX revaluation reason', { exact: true }).fill(`Reviewed October closing rate for ${kind}`);
  const picker = panel.getByRole('combobox', { name: 'Reviewed closing rate for USD', exact: true });
  assert.equal(await picker.inputValue(), '');
  assert.equal(await picker.locator(`option[value="${f.rates.settlement.id}"]`).count(), 0, 'Future settlement rate must not be offered for the closing date');
  await picker.selectOption(f.rates.closing.id);
  await panel.getByRole('button', { name: 'Preview FX revaluation', exact: true }).click();
  await panel.getByText(`NZD 170.00`, { exact: true }).waitFor();
  await panel.getByText(`NZD 160.00`, { exact: true }).waitFor();
  await panel.getByText(`Next-day reversal: 2026-11-01`, { exact: true }).waitFor();
  await panel.getByText(new RegExp(documentNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).waitFor();
  assert.equal(await panel.getByRole('button', { name: 'Post reviewed FX revaluation', exact: true }).isEnabled(), false);
  await f.shot(`${kind}-01-preview-${kind === 'receivable' ? 'desktop' : 'phone'}.png`, panel);
  await panel.getByLabel('I have reviewed the rates, open balances and next-day reversals', { exact: true }).check();
  const postedResponse = f.page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/fx-revaluations');
  await panel.getByRole('button', { name: 'Post reviewed FX revaluation', exact: true }).click();
  const response = await postedResponse; assert.equal(response.status(), 201);
  const posted = await response.json();
  await panel.getByText('FX revaluation posted', { exact: true }).waitFor();
  assert.equal(posted.journalEntryIds.length, 1); assert.equal(posted.reversalJournalEntryIds.length, 1);
  await panel.getByText('Posting audit trail', { exact: true }).click();
  await panel.getByText(posted.journalEntryIds[0], { exact: true }).waitFor();
  await panel.getByText(posted.reversalJournalEntryIds[0], { exact: true }).waitFor();
  await f.shot(`${kind}-03-posted-${kind === 'receivable' ? 'desktop' : 'phone'}.png`, panel);
  const replay = await f.post('/api/fx-revaluations', { asOfDate: '2026-10-31', exchangeRateIds: [f.rates.closing.id], reason: `Reviewed October closing rate for ${kind}`, reviewed: true });
  assert.equal(replay.replayed, true); assert.deepEqual(replay.journalEntryIds, posted.journalEntryIds);
  return posted;
}
function account(report, code) { return report.trialBalance.rows.find((row) => row.accountNumber === code)?.balance ?? '0.00'; }
async function chooseInvoiceDate(page, dialog) {
  await dialog.getByRole('button', { name: /^\d{2} [A-Z][a-z]{2} \d{4}$/ }).click();
  const calendar = page.locator('.rdp');
  for (let step = 0; step < 60; step++) {
    const caption = await calendar.locator('[aria-live="polite"][role="presentation"]').innerText();
    if (caption === 'November 2026') break;
    const previous = new Date(`${caption} 1`).getTime() > Date.UTC(2026, 10, 1);
    await calendar.getByRole('button', { name: previous ? 'Go to previous month' : 'Go to next month' }).click();
  }
  assert.equal(await calendar.locator('[aria-live="polite"][role="presentation"]').innerText(), 'November 2026');
  await calendar.getByRole('gridcell', { name: '2', exact: true }).first().click();
}
try {
  const ar = await fixture('receivable');
  try {
    const customer = await ar.post('/api/customers', { name: 'USD advisory client', email: 'buyer@example.test' });
    const invoice = await ar.post('/api/invoices', { customerId: customer.id, date: '2026-10-10', dueDate: '2026-11-10', currency: 'USD', taxInclusive: false, taxRate: '0', items: [{ description: 'Reviewed USD consulting', quantity: '1', rate: '100' }] });
    await ar.api(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
    const before = await ar.report('2026-10-01', '2026-10-30'); assert.equal(account(before, '1200'), '160.00');
    const posted = await revalue(ar, 'receivable', invoice.invoiceNumber);
    assert.equal(posted.unrealizedGain, '10.00'); assert.equal(posted.unrealizedLoss, '0.00');
    const october = await ar.report('2026-10-01', '2026-10-31'); assert.equal(account(october, '1200'), '170.00'); assert.equal(october.receivablesAging.total, '170.00'); assert.equal(account(october, '4201'), '10.00'); assert.equal(october.balanceSheet.balanced, true);
    const november1 = await ar.report('2026-11-01', '2026-11-01'); assert.equal(account(november1, '1200'), '160.00'); assert.equal(november1.receivablesAging.total, '160.00');
    await ar.page.goto(`${origin}/payments`, { waitUntil: 'networkidle' });
    await ar.page.getByRole('button', { name: /Record payment/i }).first().click();
    const dialog = ar.page.getByRole('dialog');
    await dialog.getByText(`#${invoice.invoiceNumber}`, { exact: true }).click();
    await chooseInvoiceDate(ar.page, dialog);
    await dialog.getByLabel(/^Payment Amount/).fill('100');
    await dialog.locator('button[role="combobox"]').click();
    await ar.page.getByRole('option', { name: /Bank Transfer/ }).click();
    const ratePicker = dialog.getByRole('combobox', { name: 'Settlement exchange rate', exact: true });
    await ratePicker.locator(`option[value="${ar.rates.settlement.id}"]`).waitFor({ state: 'attached' });
    await ratePicker.selectOption(ar.rates.settlement.id);
    await ar.shot('receivable-05-settlement-rate.png', dialog);
    const paymentResponse = ar.page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/payments');
    await dialog.getByRole('button', { name: 'Record Payment', exact: true }).click();
    const paymentResult = await paymentResponse; assert.equal(paymentResult.status(), 201); const payment = await paymentResult.json();
    assert.equal(payment.paymentDate, '2026-11-02'); assert.equal(payment.exchangeRateId, ar.rates.settlement.id);
    assert.equal(payment.baseAmount, '165.00'); assert.equal(payment.bookBaseAmount, '160.00'); assert.equal(payment.exchangeDifference, '5.00');
    const november = await ar.report('2026-11-01', '2026-11-02');
    assert.equal(november.cashFlow.closingCash, '165.00'); assert.equal(account(november, '1200'), '0.00'); assert.equal(november.receivablesAging.total, '0.00'); assert.equal(account(november, '4200'), '5.00'); assert.equal(november.balanceSheet.balanced, true);
    const savedInvoice = await ar.api(`/api/invoices/${invoice.id}`); assert.equal(savedInvoice.baseTotal, '160.00'); assert.equal(savedInvoice.balanceDue, '0.00');
    const octoberAfterSettlement = await ar.report('2026-10-01', '2026-10-31'); assert.equal(octoberAfterSettlement.receivablesAging.total, '170.00');
    results.receivable = { before, posted, october, octoberAfterSettlement, november1, payment, november, invoice: savedInvoice };
  } catch (error) { await ar.shot('failure-receivable.png'); console.error((await ar.page.locator('body').innerText()).slice(0, 7000)); throw error; } finally { await ar.context.close(); }

  const ap = await fixture('payable');
  try {
    const vendor = await ap.post('/api/vendors', { name: 'USD subcontractor' });
    const cost = await ap.post('/api/accounts', { name: 'USD subcontracting cost', type: 'expense', accountClass: 'expense', accountNumber: '5300' });
    const bill = await ap.post('/api/bills', { vendorId: vendor.id, issueDate: '2026-10-10', dueDate: '2026-11-10', currency: 'USD', taxInclusive: false, lines: [{ description: 'Reviewed USD supplies', quantity: '1', unitPrice: '100', taxRate: '0', accountId: cost.id }] });
    await ap.post(`/api/bills/${bill.id}/receive`, {}, 200);
    const before = await ap.report('2026-10-01', '2026-10-30'); assert.equal(account(before, '2100'), '160.00');
    const posted = await revalue(ap, 'payable', bill.billNumber);
    assert.equal(posted.unrealizedGain, '0.00'); assert.equal(posted.unrealizedLoss, '10.00');
    const october = await ap.report('2026-10-01', '2026-10-31'); assert.equal(account(october, '2100'), '170.00'); assert.equal(october.payablesAging.total, '170.00'); assert.equal(account(october, '5201'), '10.00'); assert.equal(october.balanceSheet.balanced, true);
    const november1 = await ap.report('2026-11-01', '2026-11-01'); assert.equal(account(november1, '2100'), '160.00'); assert.equal(november1.payablesAging.total, '160.00');
    await ap.page.goto(`${origin}/bills`, { waitUntil: 'networkidle' });
    await ap.page.getByRole('button', { name: 'Record payment', exact: true }).click();
    const dialog = ap.page.getByRole('dialog');
    await dialog.getByLabel('Payment date', { exact: true }).fill('2026-11-02');
    await dialog.locator('button[role="combobox"]').click();
    await ap.page.getByRole('option', { name: 'FX Operating NZD', exact: true }).click();
    const ratePicker = dialog.getByRole('combobox', { name: 'Settlement exchange rate', exact: true });
    await ratePicker.locator(`option[value="${ap.rates.settlement.id}"]`).waitFor({ state: 'attached' });
    await ratePicker.selectOption(ap.rates.settlement.id);
    await ap.shot('payable-05-settlement-rate.png', dialog);
    const paymentResponse = ap.page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/bills/${bill.id}/payments`);
    await dialog.getByRole('button', { name: 'Record 1 allocation', exact: true }).click();
    const paymentResult = await paymentResponse; assert.equal(paymentResult.status(), 201); const paymentBatch = await paymentResult.json();
    const savedBill = await ap.api(`/api/bills/${bill.id}`);
    const payment = paymentBatch.payments[0]; assert.equal(payment.paymentDate, '2026-11-02'); assert.equal(payment.exchangeRateId, ap.rates.settlement.id); assert.equal(payment.baseAmount, '165.00'); assert.equal(payment.bookBaseAmount, '160.00'); assert.equal(payment.exchangeDifference, '5.00');
    const november = await ap.report('2026-11-01', '2026-11-02');
    assert.equal(november.cashFlow.closingCash, '-165.00'); assert.equal(account(november, '2100'), '0.00'); assert.equal(november.payablesAging.total, '0.00'); assert.equal(account(november, '5200'), '5.00'); assert.equal(november.balanceSheet.balanced, true); assert.equal(savedBill.baseTotal, '160.00'); assert.equal(savedBill.balanceDue, '0.00');
    const octoberAfterSettlement = await ap.report('2026-10-01', '2026-10-31'); assert.equal(octoberAfterSettlement.payablesAging.total, '170.00');
    results.payable = { before, posted, october, octoberAfterSettlement, november1, payment, november, bill: savedBill };
  } catch (error) { await ap.shot('failure-payable.png'); console.error((await ap.page.locator('body').innerText()).slice(0, 7000)); throw error; } finally { await ap.context.close(); }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PASS: real web AR160→170/gain10→next-day160→cash165/realizedgain5; AP160→170/loss10→next-day160→cashout165/realizedloss5; reviewed rates, journals, reversals, retries and zero page errors');
} finally { await browser.close(); }
