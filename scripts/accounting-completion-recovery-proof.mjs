import { proofBrowserOptions } from './proof-runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const origin = process.env.BUSINESS_WEB_URL ?? 'http://127.0.0.1:8080';
const output = process.env.COMPLETION_RECOVERY_OUTPUT ?? '/tmp/ledgercraft-accounting-completion-recovery';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
await mkdir(output, { recursive: true });
const browser = await chromium.launch(proofBrowserOptions());
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage(); page.setDefaultTimeout(25_000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const today = new Date().toISOString().slice(0, 10);
const from = `${today.slice(0, 7)}-01`; const to = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
assert.ok(today <= to, 'Use a reporting end covering the test date');
const results = {
  platform: 'Chromium production-preview web at 1440x900 and 390x844, actual Hono/SQLite',
  seed: 'One real HTTP signup and separate API-created companies/source invoices/bills/bank funding per case; every faulty mutation and recovery below uses the actual UI. No ledger/response fixture mocks.',
  fault: 'Playwright route.fetch forwards the real write and checks its successful response, then aborts that acknowledgement. Receipt case converts a real committed receipt response to HTTP503. Only acknowledgements are faulted; resulting rows and GL are read from Hono.',
  date: today, errors, cases: {},
};
async function api(path, method = 'GET', body, expected = 200) {
  const response = await context.request.fetch(`${origin}${path}`, { method, headers: { Origin: origin, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, ...(body === undefined ? {} : { data: body }) });
  assert.equal(response.status(), expected, `${method} ${path}: ${await response.text()}`);
  return response.status() === 204 ? null : response.json();
}
const post = (path, body, status = 201) => api(path, 'POST', body, status);
const shot = async name => { await page.evaluate(() => document.querySelector('[aria-label="Dismiss update prompt"]')?.click()); return page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' }); };
const report = () => api(`/api/reports/financial?from=${from}&to=${to}&basis=accrual&baseCurrency=NZD`);
const ledger = () => api(`/api/reports/general-ledger?from=${from}&to=${to}&basis=accrual&baseCurrency=NZD`);
function countJournals(value, type, referenceId) { return new Set(value.lines.filter(line => line.referenceType === type && line.referenceId === referenceId).map(line => line.journalEntryId)).size; }
async function company(name) {
  const created = await post('/api/organisations', { name: `Recovery ${name} ${Date.now()}` });
  await api('/api/business-profile', 'PUT', { name: `Recovery ${name} Limited`, email: 'owner@recovery.example.test', country: 'NZ', gstRegistrationStatus: 'registered', defaultTaxRate: '15' });
  const customer = await post('/api/customers', { name: 'Recovery Customer', email: 'buyer@recovery.example.test' });
  const bank = await post('/api/bank-accounts', { accountName: `${name} Operating`, accountNumber: '12-3456-000001-00', bankName: 'Test Bank', accountType: 'checking', openingBalance: '0' });
  const me = await api('/api/me'); assert.equal(me.organisation.id, created.organisation.id);
  return { id: created.organisation.id, customer, bank };
}
async function invoice(fixture, net = '100') {
  const draft = await post('/api/invoices', { customerId: fixture.customer.id, date: from, dueDate: to, taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: 'Recovery consulting services', quantity: '1', rate: net }] });
  return api(`/api/invoices/${draft.id}`, 'PATCH', { status: 'sent' });
}
async function faultOnce(path, mode = 'abort') {
  const writes = []; let first = true; let resolve; let reject;
  const committed = new Promise((yes, no) => { resolve = yes; reject = no; });
  const matcher = url => url.pathname === path;
  const handler = async route => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    writes.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] ?? null });
    if (!first) return route.continue(); first = false;
    try {
      const response = await route.fetch();
      assert.equal(response.status(), 201, `Fault target ${path}: ${await response.text()}`);
      const accepted = await response.json();
      if (mode === '503') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'RECOVERY_PROOF_RECEIPT_ACK_LOST', message: 'Receipt response temporarily unavailable after acceptance' } }) });
      else await route.abort('failed');
      resolve(accepted);
    } catch (error) { reject(error); await route.abort('failed').catch(() => undefined); }
  };
  await page.route(matcher, handler);
  return { writes, committed, stop: () => page.unroute(matcher, handler) };
}
function sameReplay(fault, expectedCount = 2) {
  assert.equal(fault.writes.length, expectedCount); assert.ok(fault.writes[0].key, 'Financial request must carry its persisted key');
  for (const retry of fault.writes.slice(1)) { assert.equal(retry.key, fault.writes[0].key); assert.deepEqual(retry.body, fault.writes[0].body); }
}
async function waitNoPending(fragment) {
  await page.waitForFunction(value => !Object.keys(localStorage).some(key => key.startsWith('ledgercraft:pending-') && key.includes(value)), fragment);
}
async function startInvoicePayment(source, amount) {
  await page.goto(`${origin}/payments`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Record payment$/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(`#${source.invoiceNumber}`, { exact: true }).click();
  await dialog.getByLabel(/^Payment Amount/).fill(amount);
  await dialog.getByLabel('Reference Number', { exact: true }).fill('RECOVERY-PROOF');
  await dialog.getByRole('button', { name: 'Record Payment', exact: true }).click();
  return dialog;
}
async function openInvoiceRecovery(source) {
  await page.goto(`${origin}/payments`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Recover payment', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('select').selectOption(source.id);
  await dialog.getByRole('button', { name: 'Resume original invoice payment', exact: true }).waitFor();
  return dialog;
}
async function paymentEvidence(source, expected) {
  const fresh = await api(`/api/invoices/${source.id}`);
  const payments = (await api(`/api/payments?invoiceId=${source.id}`)).payments;
  const receipts = (await api('/api/receipts')).receipts.filter(row => payments.some(payment => payment.id === row.paymentId));
  const books = await report(); const gl = await ledger();
  assert.equal(payments.length, 1); assert.equal(payments[0].amount, expected.paid); assert.equal(fresh.totalPaid, expected.paid); assert.equal(fresh.balanceDue, expected.balance);
  assert.equal(books.cashFlow.closingCash, expected.cash); assert.equal(books.receivablesAging.total, expected.balance);
  assert.equal(books.profitLoss.revenue, '100.00'); assert.equal(books.taxSummary.outputGst, '15.00');
  assert.equal(countJournals(gl, 'invoice_payment', payments[0].id), 1); assert.equal(books.trialBalance.balanced, true); assert.equal(books.balanceSheet.balanced, true);
  return { invoice: fresh, payments, receipts, books, paymentJournalCount: 1 };
}
async function openCredits(source) {
  await page.goto(`${origin}/invoices/${source.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Credit notes and refunds', exact: true }).click();
  const section = page.locator('section[aria-label="Invoice credits and refunds"]');
  await section.getByLabel('Credit line amount', { exact: true }).waitFor(); return section;
}
async function issueFields(section) {
  await section.getByLabel('Credit note date', { exact: true }).fill(today);
  await section.getByLabel('Credit line amount', { exact: true }).fill('200.00');
  await section.getByLabel('Credit GST rate (%)', { exact: true }).fill('15');
  await section.getByLabel('Credit note reason', { exact: true }).fill('Recovery proof agreed service credit');
  await section.getByLabel('I have checked this credit against the original invoice and its GST treatment', { exact: true }).check();
}
try {
  await post('/api/auth/sign-up/email', { name: 'Recovery Accountant', email: `recovery-${Date.now()}@example.test`, password: `Local-${crypto.randomUUID()}` }, 200);

  // 1. A partial invoice payment was committed; only its response was lost.
  let fixture = await company('Partial invoice'); let source = await invoice(fixture);
  let fault = await faultOnce('/api/payments');
  await startInvoicePayment(source, '50.00'); const accepted = await fault.committed;
  await page.getByRole('button', { name: 'Resume original invoice payment', exact: true }).waitFor();
  const before = await paymentEvidence(source, { paid: '50.00', balance: '65.00', cash: '50.00' }); assert.equal(before.receipts.length, 0);
  await shot('01-invoice-partial-lost-ack-desktop');
  let recovery = await openInvoiceRecovery(source); await page.setViewportSize({ width: 390, height: 844 }); recovery = await openInvoiceRecovery(source); await shot('02-invoice-partial-resume-phone');
  await recovery.getByRole('button', { name: 'Resume original invoice payment', exact: true }).click(); await waitNoPending(source.id);
  const partial = await paymentEvidence(source, { paid: '50.00', balance: '65.00', cash: '50.00' }); assert.equal(partial.receipts.length, 1); assert.equal(partial.payments[0].id, accepted.id); sameReplay(fault);
  results.cases.partialInvoice = { expected: { paymentRows: 1, paymentJournals: 1, receiptRows: 1, cash: '50.00', paid: '50.00', balance: '65.00' }, beforeRecovery: before, actual: partial, replay: fault.writes };
  await fault.stop(); await page.setViewportSize({ width: 1440, height: 900 }); await shot('03-invoice-partial-recovered');

  // 2. The invoice is fully paid; its real receipt acknowledgement becomes503.
  fixture = await company('Receipt acknowledgement'); source = await invoice(fixture);
  const paymentPosts = []; const trackPayments = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/payments') paymentPosts.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() }); };
  page.on('request', trackPayments); fault = await faultOnce('/api/receipts', '503');
  await startInvoicePayment(source, '115.00'); await fault.committed;
  await page.getByText('The payment was accepted; receipt recovery is still pending.', { exact: true }).waitFor();
  const fullBefore = await paymentEvidence(source, { paid: '115.00', balance: '0.00', cash: '115.00' }); assert.equal(fullBefore.receipts.length, 1);
  await shot('04-fully-paid-receipt-503'); recovery = await openInvoiceRecovery(source);
  await recovery.getByText('The payment was accepted; receipt recovery is still pending.', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 }); recovery = await openInvoiceRecovery(source); await shot('05-fully-paid-resume-phone');
  await recovery.getByRole('button', { name: 'Resume original invoice payment', exact: true }).click(); await waitNoPending(source.id);
  const full = await paymentEvidence(source, { paid: '115.00', balance: '0.00', cash: '115.00' }); assert.equal(full.receipts.length, 1); assert.equal(paymentPosts.length, 1); assert.equal(fault.writes.length, 2); assert.deepEqual(fault.writes[0].body, fault.writes[1].body);
  results.cases.fullyPaidReceipt = { expected: { cashPosts: 1, paymentRows: 1, paymentJournals: 1, receiptRows: 1, cash: '115.00', balance: '0.00' }, beforeRecovery: fullBefore, actual: full, paymentPosts, receiptRequests: fault.writes };
  await fault.stop(); page.off('request', trackPayments); await page.setViewportSize({ width: 1440, height: 900 }); await shot('06-fully-paid-receipt-recovered');

  // 3. Supplier instalment69 was committed against a345 received bill.
  fixture = await company('Supplier payment');
  const expense = await post('/api/accounts', { name: 'Operating costs', type: 'expense', accountClass: 'expense', accountNumber: '5000' });
  const bankLedger = await post('/api/accounts', { name: fixture.bank.accountName, type: 'bank', accountClass: 'asset', accountNumber: `BANK-${fixture.bank.id.slice(0, 8).toUpperCase()}`, currency: 'NZD' });
  const capital = await post('/api/accounts', { name: 'Owner capital', type: 'equity', accountClass: 'equity', accountNumber: '3000' });
  const funding = await post('/api/journal-entries', { description: 'Opening bank funds for recovery proof', entryDate: from, debitAccountId: bankLedger.id, creditAccountId: capital.id, amount: '1000.00' });
  await api(`/api/journal-entries/${funding.id}`, 'PATCH', { status: 'posted' });
  const vendor = await post('/api/vendors', { name: 'Recovery supplier' });
  const bill = await post('/api/bills', { vendorId: vendor.id, issueDate: from, dueDate: to, currency: 'NZD', taxInclusive: true, lines: [{ description: 'Supplier recovery source', quantity: '1', unitPrice: '345', taxRate: '15', accountId: expense.id }] });
  await post(`/api/bills/${bill.id}/receive`, {}, 200); fault = await faultOnce(`/api/bills/${bill.id}/payments`);
  await page.goto(`${origin}/bills`, { waitUntil: 'networkidle' });
  await page.getByRole('row').filter({ hasText: bill.billNumber }).getByRole('button', { name: 'Record payment', exact: true }).click();
  let dialog = page.getByRole('dialog'); await dialog.getByRole('combobox').first().click(); await page.getByRole('option', { name: fixture.bank.accountName, exact: true }).click();
  await dialog.getByLabel('Amount', { exact: true }).fill('69.00'); await dialog.getByLabel('Payment date', { exact: true }).fill(today);
  await dialog.getByRole('button', { name: 'Record 1 allocation', exact: true }).click(); await fault.committed;
  await dialog.getByRole('button', { name: 'Retry same payment', exact: true }).waitFor(); await shot('07-bill-payment-lost-ack');
  await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('row').filter({ hasText: bill.billNumber }).getByRole('button', { name: 'Resume pending payment', exact: true }).click();
  dialog = page.getByRole('dialog'); assert.equal(await dialog.getByLabel('Amount', { exact: true }).inputValue(), '69.00'); assert.equal(await dialog.getByLabel('Amount', { exact: true }).isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${origin}/bills`, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Resume pending payment', exact: true }).click(); dialog = page.getByRole('dialog'); await shot('08-bill-payment-resume-phone');
  await dialog.getByRole('button', { name: 'Retry same payment', exact: true }).click(); await waitNoPending(bill.id);
  const paidBill = await api(`/api/bills/${bill.id}`); const billBooks = await report(); const billGl = await ledger();
  assert.equal(paidBill.payments.length, 1); assert.equal(paidBill.payments[0].amount, '69.00'); assert.equal(paidBill.balanceDue, '276.00'); assert.equal(paidBill.totalPaid, '69.00'); assert.equal(billBooks.cashFlow.closingCash, '931.00'); assert.equal(billBooks.payablesAging.total, '276.00'); assert.equal(billBooks.balanceSheet.balanced, true); assert.equal(countJournals(billGl, 'bill_payment', paidBill.payments[0].id), 1); sameReplay(fault);
  results.cases.supplierInstalment = { expected: { payments: 1, paymentJournals: 1, paid: '69.00', balance: '276.00', cash: '931.00' }, actual: { bill: paidBill, books: billBooks, paymentJournalCount: 1 }, replay: fault.writes }; await fault.stop(); await page.setViewportSize({ width: 1440, height: 900 });

  // 4. Credit issuance itself commits230, loses its response, then replays once.
  fixture = await company('Credit issue'); source = await invoice(fixture, '1000'); fault = await faultOnce('/api/credit-notes');
  let section = await openCredits(source); await issueFields(section); await section.getByRole('button', { name: 'Issue credit note', exact: true }).click(); const credit = await fault.committed;
  await section.getByRole('button', { name: 'Retry pending credit note', exact: true }).waitFor(); await section.getByRole('button', { name: 'Retry pending credit note', exact: true }).scrollIntoViewIfNeeded(); await shot('09-credit-issue-lost-ack');
  section = await openCredits(source); await section.getByRole('button', { name: 'Retry pending credit note', exact: true }).waitFor(); assert.equal(await section.getByLabel('Credit line amount', { exact: true }).inputValue(), '200.00');
  await page.setViewportSize({ width: 390, height: 844 }); section = await openCredits(source); await section.getByRole('button', { name: 'Retry pending credit note', exact: true }).waitFor(); await section.getByRole('button', { name: 'Retry pending credit note', exact: true }).scrollIntoViewIfNeeded(); await shot('10-credit-issue-resume-phone');
  await section.getByLabel('I have checked this credit against the original invoice and its GST treatment', { exact: true }).check(); await section.getByRole('button', { name: 'Retry pending credit note', exact: true }).click();
  await section.getByText('Credit note issued', { exact: true }).waitFor(); await waitNoPending(source.id);
  const notes = (await api(`/api/credit-notes?invoiceId=${source.id}`)).creditNotes; const creditedInvoice = await api(`/api/invoices/${source.id}`); const creditBooks = await report(); const creditGl = await ledger();
  assert.equal(notes.length, 1); assert.equal(notes[0].id, credit.id); assert.equal(creditedInvoice.totalCredited, '230.00'); assert.equal(creditedInvoice.balanceDue, '920.00'); assert.equal(creditBooks.profitLoss.revenue, '800.00'); assert.equal(creditBooks.taxSummary.outputGst, '120.00'); assert.equal(countJournals(creditGl, 'credit_note', credit.id), 1); assert.equal(creditBooks.balanceSheet.balanced, true); sameReplay(fault);
  results.cases.creditIssue = { expected: { creditNotes: 1, creditJournals: 1, credited: '230.00', balance: '920.00', revenue: '800.00', outputGst: '120.00' }, actual: { invoice: creditedInvoice, notes, books: creditBooks, creditJournalCount: 1 }, replay: fault.writes }; await fault.stop(); await page.setViewportSize({ width: 1440, height: 900 });

  // 5. A real customer refund commits230; a reload must recover it at available0.
  fixture = await company('Customer refund'); source = await invoice(fixture, '1000');
  await post('/api/payments', { invoiceId: source.id, amount: '1150.00', paymentDate: today, paymentMethod: 'bank_transfer' });
  const refundable = await post('/api/credit-notes', { invoiceId: source.id, issueDate: today, reason: 'Recovery proof paid invoice credit', taxInclusive: false, taxRate: '15', items: [{ description: 'Paid service credit', quantity: '1', rate: '200.00' }] });
  fault = await faultOnce(`/api/credit-notes/${refundable.id}/refunds`); section = await openCredits(source);
  await section.getByRole('button', { name: `Refund ${refundable.creditNoteNumber}`, exact: true }).click(); await section.locator('select').filter({ has: page.locator(`option[value="${fixture.bank.id}"]`) }).selectOption(fixture.bank.id);
  await section.getByLabel('Credit action date', { exact: true }).fill(today); await section.getByLabel('I have reviewed this credit note action and supporting records', { exact: true }).check();
  await section.getByRole('button', { name: 'Confirm customer refund', exact: true }).click(); await fault.committed;
  await section.getByRole('button', { name: 'Retry customer refund', exact: true }).waitFor(); await section.getByRole('button', { name: 'Retry customer refund', exact: true }).scrollIntoViewIfNeeded(); await shot('11-customer-refund-lost-ack');
  section = await openCredits(source); await section.getByRole('button', { name: `Resume pending refund ${refundable.creditNoteNumber}`, exact: true }).click();
  assert.equal(await section.getByLabel('Customer refund amount', { exact: true }).inputValue(), '230.00'); assert.equal(await section.getByLabel('Customer refund amount', { exact: true }).isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 }); section = await openCredits(source); await section.getByRole('button', { name: `Resume pending refund ${refundable.creditNoteNumber}`, exact: true }).click(); await section.getByRole('button', { name: 'Retry customer refund', exact: true }).scrollIntoViewIfNeeded(); await shot('12-customer-refund-resume-phone');
  await section.getByLabel('I have reviewed this credit note action and supporting records', { exact: true }).check(); await section.getByRole('button', { name: 'Retry customer refund', exact: true }).click(); await section.getByText('Customer refund recorded', { exact: true }).waitFor(); await waitNoPending(source.id);
  const refunded = await api(`/api/credit-notes/${refundable.id}`); const refundBooks = await report(); const refundGl = await ledger();
  assert.equal(refunded.refunds.length, 1); assert.equal(refunded.refundedAmount, '230.00'); assert.equal(refunded.refundAvailable, '0.00'); assert.equal(refundBooks.cashFlow.closingCash, '920.00'); assert.equal(refundBooks.taxSummary.outputGst, '120.00'); assert.equal(refundBooks.balanceSheet.balanced, true); assert.equal(refundBooks.trialBalance.balanced, true); assert.equal(countJournals(refundGl, 'credit_note_refund', refunded.refunds[0].id), 1); sameReplay(fault);
  results.cases.customerRefund = { expected: { refunds: 1, refundJournals: 1, refunded: '230.00', available: '0.00', cash: '920.00', outputGst: '120.00' }, actual: { note: refunded, books: refundBooks, refundJournalCount: 1 }, replay: fault.writes }; await fault.stop(); await page.setViewportSize({ width: 1440, height: 900 }); await shot('13-customer-refund-recovered');

  assert.deepEqual(errors, []); await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log('PASS: real committed invoice partial/full+receipt503, supplier69, credit230 and refund230 acknowledgements lost, reload+UIresume preserve originalbody/key; one cash/CN/refund journal and unique receipt per source');
} catch (error) {
  await shot('failure').catch(() => undefined); await writeFile(`${output}/partial-results.json`, JSON.stringify(results, null, 2));
  console.error((await page.locator('body').innerText()).slice(0, 7000)); throw error;
} finally { await browser.close(); }
