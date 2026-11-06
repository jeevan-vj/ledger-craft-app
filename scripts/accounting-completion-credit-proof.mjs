import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const origin = process.env.BUSINESS_WEB_URL ?? 'http://127.0.0.1:8080';
const output = process.env.COMPLETION_CREDIT_OUTPUT ?? '/tmp/ledgercraft-accounting-completion-credit';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage(); page.setDefaultTimeout(25_000);
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
async function api(route, method = 'GET', body, status = 200) {
  const response = await context.request.fetch(`${origin}${route}`, { method, headers: { Origin: origin, 'Idempotency-Key': crypto.randomUUID() }, data: body });
  assert.equal(response.status(), status, `${method} ${route}: ${await response.text()}`);
  return response.json();
}
const post = (route, body, status = 201) => api(route, 'POST', body, status);
const report = () => api('/api/reports/financial?from=2026-04-01&to=2026-04-30&basis=accrual&baseCurrency=NZD');
const shot = (name, target = page) => target.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
async function panel(invoice) {
  await page.goto(`${origin}/invoices/${invoice.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Credit notes and refunds', exact: true }).click();
  const section = page.locator('section[aria-label="Invoice credits and refunds"]');
  await section.getByText('No credit notes recorded for this invoice', { exact: true }).waitFor();
  return section;
}
async function issue(section) {
  await section.getByLabel('Credit note date', { exact: true }).fill('2026-04-15');
  await section.getByLabel('Credit line amount', { exact: true }).fill('200.00');
  await section.getByLabel('Credit note reason', { exact: true }).fill('Returned consulting service, source verified');
  await section.getByLabel('I have checked this credit against the original invoice and its GST treatment', { exact: true }).check();
  const response = page.waitForResponse((value) => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/credit-notes');
  await section.getByRole('button', { name: 'Issue credit note', exact: true }).click();
  const created = await response; assert.equal(created.status(), 201); const note = await created.json();
  await section.getByText(note.creditNoteNumber, { exact: true }).waitFor();
  assert.equal(note.total, '230.00'); assert.equal(note.taxAmount, '30.00'); return note;
}
async function confirm(section, kind, reason, date = '2026-04-16') {
  await section.getByLabel('Credit action date', { exact: true }).fill(date);
  if (reason) await section.getByLabel('Credit action reason', { exact: true }).fill(reason);
  await section.getByLabel('I have reviewed this credit note action and supporting records', { exact: true }).check();
  await section.getByRole('button', { name: kind, exact: true }).click();
}
const results = { platform: 'Chromium real web UI, desktop and 390px phone', seed: 'Real HTTP synthetic company, invoices and payment; credit issuance/refund/reversal actions use actual UI', errors };
try {
  await post('/api/auth/sign-up/email', { name: 'Credit Accountant', email: `credit-proof-${Date.now()}@example.test`, password: `Local-${crypto.randomUUID()}` }, 200);
  await api('/api/business-profile', 'PUT', { name: 'Kauri Credit Proof Limited', email: 'owner@credit.example.test', country: 'NZ', gstRegistrationStatus: 'registered', defaultTaxRate: '15' });
  const customer = await post('/api/customers', { name: 'Credit Customer Limited', email: 'buyer@credit.example.test' });
  const invoiceInput = { customerId: customer.id, date: '2026-04-10', dueDate: '2026-04-30', taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: 'Consulting services', quantity: '1', rate: '1000' }] };
  const unpaid = await post('/api/invoices', invoiceInput);
  await api(`/api/invoices/${unpaid.id}`, 'PATCH', { status: 'sent' });
  let section = await panel(unpaid);
  results.unpaidCredit = await issue(section);
  results.unpaidInvoiceAfterCredit = await api(`/api/invoices/${unpaid.id}`);
  assert.equal(results.unpaidInvoiceAfterCredit.balanceDue, '920.00');
  assert.equal(results.unpaidInvoiceAfterCredit.totalPaid, '0.00'); assert.equal(results.unpaidInvoiceAfterCredit.totalCredited, '230.00');
  results.unpaidReport = await report(); assert.equal(results.unpaidReport.profitLoss.revenue, '800.00'); assert.equal(results.unpaidReport.receivablesAging.total, '920.00'); assert.equal(results.unpaidReport.taxSummary.outputGst, '120.00'); assert.equal(results.unpaidReport.trialBalance.balanced, true);
  await shot('01-unpaid-credit-desktop', section);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(page.url(), { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Credit notes and refunds', exact: true }).click(); await section.getByText(results.unpaidCredit.creditNoteNumber, { exact: true }).waitFor(); await shot('02-unpaid-credit-phone', section); await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(page.url(), { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Credit notes and refunds', exact: true }).click(); await section.getByText(results.unpaidCredit.creditNoteNumber, { exact: true }).waitFor();
  await section.getByRole('button', { name: `Reverse ${results.unpaidCredit.creditNoteNumber}`, exact: true }).click();
  await confirm(section, 'Confirm credit note reversal', 'Credit reversed after source review');
  await section.getByText('Credit note reversed', { exact: true }).waitFor();
  results.afterUnpaidReversal = await report(); assert.equal(results.afterUnpaidReversal.profitLoss.revenue, '1000.00'); assert.equal(results.afterUnpaidReversal.receivablesAging.total, '1150.00'); assert.equal(results.afterUnpaidReversal.taxSummary.outputGst, '150.00');

  const paid = await post('/api/invoices', invoiceInput);
  await post('/api/payments', { invoiceId: paid.id, amount: '1150', paymentDate: '2026-04-12', paymentMethod: 'bank_transfer' });
  const bank = await post('/api/bank-accounts', { accountName: 'Customer Refund Bank', accountNumber: '12-3456-000001-00', bankName: 'Test Bank', accountType: 'checking', openingBalance: '0' });
  section = await panel(paid);
  results.paidCredit = await issue(section);
  assert.equal(results.paidCredit.customerCreditAmount, '230.00'); assert.equal(results.paidCredit.refundAvailable, '230.00');
  await page.getByRole('heading', { name: 'Settled with credits', exact: true }).waitFor();
  const share = await post(`/api/invoices/${paid.id}/share`, {});
  const buyer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const buyerPage = await buyer.newPage(); buyerPage.on('pageerror', (error) => errors.push(error.message));
  await buyerPage.goto(`${origin}/shared/invoice/${share.shareToken}`, { waitUntil: 'networkidle' });
  await buyerPage.getByLabel('Payment status: Settled with credits', { exact: true }).waitFor();
  await shot('05-buyer-credited-settlement-phone', buyerPage);
  results.publicSettlement = 'Settled with credits'; await buyer.close();
  await section.getByRole('button', { name: `Refund ${results.paidCredit.creditNoteNumber}`, exact: true }).click();
  await section.getByRole('combobox', { name: 'Refund paid from account', exact: true }).selectOption(bank.id);
  await confirm(section, 'Confirm customer refund', undefined, '2026-04-17');
  await section.getByText('Customer refund recorded', { exact: true }).waitFor();
  results.afterRefund = await report(); assert.equal(results.afterRefund.profitLoss.revenue, '1800.00'); assert.equal(results.afterRefund.taxSummary.outputGst, '270.00'); assert.equal(results.afterRefund.cashFlow.closingCash, '920.00'); assert.equal(results.afterRefund.balanceSheet.balanced, true);
  results.refundedNote = (await api(`/api/credit-notes/${results.paidCredit.id}`));
  assert.equal(results.refundedNote.refundedAmount, '230.00'); assert.equal(results.refundedNote.refundAvailable, '0.00');
  await shot('03-paid-credit-refund', section);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(page.url(), { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Credit notes and refunds', exact: true }).click(); await section.getByText(results.paidCredit.creditNoteNumber, { exact: true }).waitFor(); await shot('04-paid-credit-refund-phone', section); await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(page.url(), { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Credit notes and refunds', exact: true }).click(); await section.getByText(results.paidCredit.creditNoteNumber, { exact: true }).waitFor();
  const refund = results.refundedNote.refunds.find((record) => record.status === 'completed');
  await section.getByRole('button', { name: `Reverse refund ${refund.id}`, exact: true }).click();
  await confirm(section, 'Confirm refund reversal', 'Refund did not leave the bank', '2026-04-18');
  await section.getByText('Customer refund reversed', { exact: true }).waitFor();
  results.afterRefundReversal = await report(); assert.equal(results.afterRefundReversal.cashFlow.closingCash, '1150.00'); assert.equal(results.afterRefundReversal.taxSummary.outputGst, '270.00');
  await section.getByRole('button', { name: `Reverse ${results.paidCredit.creditNoteNumber}`, exact: true }).click();
  await confirm(section, 'Confirm credit note reversal', 'Customer retained the original service', '2026-04-19');
  await section.getByText('Credit note reversed', { exact: true }).waitFor();
  results.finalReport = await report(); assert.equal(results.finalReport.profitLoss.revenue, '2000.00'); assert.equal(results.finalReport.taxSummary.outputGst, '300.00'); assert.equal(results.finalReport.receivablesAging.total, '1150.00'); assert.equal(results.finalReport.cashFlow.closingCash, '1150.00'); assert.equal(results.finalReport.trialBalance.balanced, true); assert.equal(results.finalReport.balanceSheet.balanced, true);
  assert.deepEqual(errors, []); await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log('PASS: actual UI credit230 reducesAR1150→920/revenue1000→800/GST150→120; paidcredit230 refundcash1150→920; refundreversal andcreditreversal restore independentbooks');
} catch (error) { await shot('failure'); console.error((await page.locator('body').innerText()).slice(0, 7000)); throw error; }
finally { await browser.close(); }
