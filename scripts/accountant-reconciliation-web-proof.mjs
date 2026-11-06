import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.BUSINESS_WEB_URL ?? 'http://127.0.0.1:8080';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const output = process.env.ACCOUNTANT_RECON_WEB_OUTPUT ?? '/tmp/ledgercraft-accountant-reconciliation-web';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = []; const results = { platform: 'Chromium web: real Hono/SQLite, desktop1440x900 and phone390x844', expected: { statement: '0.14', postedBank: '0.10', bankError: '-0.04', adjustedBank: '0.10', adjustedBook: '0.10', difference: '0.00', status: 'completed' }, errors, cases: [] };
try {
  for (const [kind, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage(); page.setDefaultTimeout(60_000);
    page.on('pageerror', error => errors.push(`${kind}: ${error.message}`));
    async function api(route, method = 'GET', body, status = 200) {
      const response = await context.request.fetch(`${origin}${route}`, { method, headers: { Origin: origin, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, data: body });
      assert.equal(response.status(), status, `${method} ${route}: ${await response.text()}`); return response.json();
    }
    try {
      await api('/api/auth/sign-up/email', 'POST', { name: `Statement ${kind} Accountant`, email: `statement-${kind}-${crypto.randomUUID()}@example.test`, password: `Local-${crypto.randomUUID()}` });
      await api('/api/business-profile', 'PUT', { name: 'Kauri Statement Review Limited', email: 'owner@statement.example.test', country: 'NZ' });
      const bank = await api('/api/bank-accounts', 'POST', { accountName: 'Statement review bank', accountNumber: crypto.randomUUID(), bankName: 'Synthetic Bank', accountType: 'checking', currency: 'NZD' }, 201);
      await api('/api/bank-transactions', 'POST', { bankAccountId: bank.id, transactionDate: '2026-10-10', amount: '0.10', type: 'credit', description: 'Recorded bank interest' }, 201);
      const session = await api('/api/reconciliation-sessions', 'POST', { bankAccountId: bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0.00', statementClosingBalance: '0.14' }, 201);
      const before = await api(`/api/reconciliation-sessions/${session.id}/summary`);
      assert.equal(before.bookBalance, '0.10'); assert.equal(before.finalDifference, '0.04'); assert.equal(before.isReconciled, false);
      await page.goto(`${origin}/reconciliation?session=${session.id}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.querySelector('[aria-label="Dismiss update prompt"]')?.click());
      await page.getByRole('tab', { name: /Adjustments/ }).click();
      await page.getByRole('button', { name: 'Add Adjustment', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText(/Record bank fees, interest, returned payments and book corrections/).waitFor();
      await dialog.getByRole('combobox', { name: 'Adjustment Type' }).click();
      assert.equal(await page.getByRole('option', { name: 'Bank Fee', exact: true }).count(), 0);
      assert.equal(await page.getByRole('option', { name: 'Book Error', exact: true }).count(), 0);
      await page.getByRole('option', { name: 'Bank Error', exact: true }).click();
      await dialog.getByLabel('Description', { exact: true }).fill('Bank confirmed interest overstated by four cents');
      await dialog.getByLabel('Amount', { exact: true }).fill('-0.04');
      await dialog.getByLabel('Reference Number (Optional)', { exact: true }).fill('BANK-CORRECTION-001');
      await dialog.screenshot({ path: path.join(output, `${kind}-01-reviewed-statement-correction.png`), animations: 'disabled' });
      const savedResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/reconciliation-sessions/${session.id}/adjustments`);
      await dialog.getByRole('button', { name: 'Add Adjustment', exact: true }).click();
      const response = await savedResponse; assert.equal(response.status(), 201);
      const submitted = response.request().postDataJSON(); assert.equal(submitted.amount, '-0.04'); assert.equal(submitted.affectsBook, false); assert.equal(submitted.affectsBank, true);
      const summary = await api(`/api/reconciliation-sessions/${session.id}/summary`);
      assert.equal(summary.adjustedBankBalance, '0.10'); assert.equal(summary.bookBalance, '0.10'); assert.equal(summary.adjustedBookBalance, '0.10'); assert.equal(summary.finalDifference, '0.00'); assert.equal(summary.isReconciled, true);
      await page.getByRole('tab', { name: 'Summary Report', exact: true }).click();
      await page.getByText('Bank Statement Corrections', { exact: true }).waitFor();
      await page.getByText('Book balances include posted journals only. Record missing transactions in the books before reconciliation.', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `${kind}-02-real-posted-book-report.png`), fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: 'Complete Reconciliation', exact: true }).click();
      const completeResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/reconciliation-sessions/${session.id}/complete`);
      await page.getByRole('alertdialog').getByRole('button', { name: 'Complete Reconciliation', exact: true }).click();
      const completedResponse = await completeResponse; assert.equal(completedResponse.status(), 200); const completed = await completedResponse.json();
      assert.equal(completed.status, 'completed'); assert.equal(completed.bookClosingBalance, '0.10'); assert.equal(completed.difference, '0.00');
      await page.getByText('Completed', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `${kind}-03-completed.png`), fullPage: true, animations: 'disabled' });
      const accounts = (await api('/api/accounts')).accounts;
      const cost = accounts.find(account => account.accountNumber === '5000') ?? await api('/api/accounts', 'POST', { name: 'Contracting cost', accountNumber: '5000', type: 'expense', accountClass: 'expense', currency: 'NZD' }, 201);
      const vendor = await api('/api/vendors', 'POST', { name: 'Reviewed subcontractor' }, 201);
      const today = new Date().toISOString().slice(0, 10);
      const bill = await api('/api/bills', 'POST', { vendorId: vendor.id, issueDate: today, dueDate: today, taxInclusive: false, currency: 'NZD', lines: [{ description: 'Compound journal review', quantity: '1', unitPrice: '1000', taxRate: '15', accountId: cost.id }] }, 201);
      await api(`/api/bills/${bill.id}/receive`, 'POST', {});
      const journals = (await api('/api/journal-entries')).journalEntries;
      const journal = journals.find(entry => entry.lines?.some(line => line.debitAmount === '150.00') && entry.lines?.some(line => line.debitAmount === '1000.00'));
      assert.ok(journal); assert.equal(journal.lines.length, 3); assert.equal(journal.debitTotal, '1150.00'); assert.equal(journal.creditTotal, '1150.00');
      await page.goto(`${origin}/journal-entries`, { waitUntil: 'networkidle' });
      await page.getByPlaceholder('Search entries...').fill(journal.entryNumber);
      await page.getByRole('button', { name: `View journal ${journal.entryNumber}`, exact: true }).click();
      const posting = page.getByRole('dialog').getByRole('table', { name: 'Journal posting lines', exact: true });
      for (const line of journal.lines) await posting.getByText(line.accountName, { exact: true }).waitFor();
      assert.equal(await posting.getByRole('row').count(), 6);
      assert.equal(await posting.getByText('$1150.00', { exact: true }).count(), 3);
      await posting.getByText('$150.00', { exact: true }).waitFor();
      await page.getByRole('dialog').screenshot({ path: path.join(output, `${kind}-04-complete-gst-journal.png`), animations: 'disabled' });
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      const downloaded = page.waitForEvent('download', { timeout: 90_000 });
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const csvPath = path.join(output, `${kind}-journal-lines.csv`); await (await downloaded).saveAs(csvPath);
      const csv = await readFile(csvPath, 'utf8');
      for (const line of journal.lines) assert.ok(csv.includes(line.accountName));
      assert.ok(csv.includes('150.00')); assert.ok(csv.includes('1150.00')); assert.equal(csv.trim().split('\n').length, 4);
      results.cases.push({ kind, before, submitted, summary, completed, journal, exportedCsv: path.basename(csvPath) });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []); await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PASS: actual web reviewed bank error -0.04 adjusts statement0.14 to posted books0.10, difference0, completed0.10 at desktop and phone; exact request strings; compoundGSTjournalDr1150=Cr1150withthreevisible/exportedlines; zero page errors');
} finally { await browser.close(); }
