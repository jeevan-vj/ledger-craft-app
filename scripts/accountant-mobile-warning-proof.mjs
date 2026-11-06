import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from '@playwright/test';

// This historical-fixture proof deliberately inserts a pre-fix metadata-only
// adjustment in an isolated verification database. New API writes must reject it.
const origin = process.env.BUSINESS_MOBILE_URL ?? 'http://127.0.0.1:8081';
const apiOrigin = process.env.BUSINESS_API_URL ?? 'http://127.0.0.1:3001';
const databasePath = process.env.ACCOUNTANT_TEST_DATABASE;
const output = process.env.ACCOUNTANT_WARNING_OUTPUT ?? '/tmp/ledgercraft-accountant-mobile-warning';
for (const value of [origin, apiOrigin]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(value).hostname));
assert.ok(databasePath?.includes('accountant') && !databasePath.includes('production'), 'Provide the dedicated accountant verification SQLite path');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
const page = await context.newPage(); page.setDefaultTimeout(60_000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
async function api(route, method = 'GET', data, status = 200) {
  const response = await context.request.fetch(`${apiOrigin}${route}`, { method, data, headers: { Origin: origin, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) } });
  assert.equal(response.status(), status, `${route}: ${await response.text()}`);
  return response.json();
}
try {
  await api('/api/auth/sign-up/email', 'POST', { name: 'Historical Statement Reviewer', email: `accountant-warning-${crypto.randomUUID()}@example.test`, password: `Local-${crypto.randomUUID()}` });
  await api('/api/business-profile', 'PUT', { name: 'Synthetic legacy statement company', email: 'owner@example.test', country: 'NZ' });
  const bank = await api('/api/bank-accounts', 'POST', { accountName: 'Historical review bank', bankName: 'Local Test Bank', accountNumber: crypto.randomUUID(), accountType: 'checking', currency: 'NZD', openingBalance: '0.00' }, 201);
  const transaction = { id: crypto.randomUUID() };
  const session = await api('/api/reconciliation-sessions', 'POST', { bankAccountId: bank.id, statementStartDate: '2026-10-01', statementEndDate: '2026-10-31', statementOpeningBalance: '0.00', statementClosingBalance: '-10.00' }, 201);
  await api(`/api/reconciliation-sessions/${session.id}/adjustments`, 'POST', { adjustmentType: 'bank_fee', amount: '10.00', affectsBank: false, affectsBook: true, description: 'New book fee declaration must be rejected' }, 422);
  const db = new DatabaseSync(databasePath);
  try {
    const owner = db.prepare('SELECT organisation_id, user_id FROM bank_accounts WHERE id = ?').get(bank.id); assert.ok(owner);
    // Historical statement row only: the ordinary import API intentionally
    // creates a posted cash journal and cannot model this unposted legacy case.
    db.prepare('INSERT INTO bank_transactions (id, organisation_id, user_id, bank_account_id, transaction_date, description, amount, type, is_reconciled, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(transaction.id, owner.organisation_id, owner.user_id, bank.id, '2026-10-20', 'Legacy unposted bank fee fixture', '10.00', 'debit', 1, 'import');
    db.prepare('INSERT INTO reconciliation_adjustments (id, organisation_id, user_id, reconciliation_id, adjustment_type, description, amount, affects_bank, affects_book, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), owner.organisation_id, owner.user_id, session.id, 'bank_fee', 'Pre-fix historical fee declaration without journal', '10.00', 0, 1, 'pending');
  } finally { db.close(); }
  const summary = await api(`/api/reconciliation-sessions/${session.id}/summary`);
  assert.equal(summary.bookBalance, '0.00'); assert.equal(summary.adjustedBookBalance, '0.00'); assert.equal(summary.finalDifference, '-10.00'); assert.equal(summary.isReconciled, false); assert.ok(summary.warnings.length > 0);
  await page.goto(`${origin}/banking/reconcile/${transaction.id}`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.getByRole('button', { name: 'Review bank statement', exact: true }).click();
  await page.getByRole('button', { name: 'Statement 2026-10-01 to 2026-10-31 · In progress', exact: true }).click();
  for (const warning of summary.warnings) await page.getByText(warning, { exact: true }).waitFor();
  await page.getByText('Posted book balance: $0.00', { exact: true }).waitFor();
  await page.getByText('Final statement difference: -$10.00', { exact: true }).waitFor();
  await page.getByText('Resolve the statement difference before completing.', { exact: true }).waitFor();
  let completionPostsFromUi = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/reconciliation-sessions/${session.id}/complete`) completionPostsFromUi++; });
  const completionButton = page.getByRole('button', { name: 'Complete reviewed statement', exact: true });
  // GestureDetector's web button does not forward a native disabled attribute;
  // verify the actual financial guard rather than inferring it from markup.
  await completionButton.click(); await page.waitForLoadState('networkidle');
  assert.equal(completionPostsFromUi, 0);
  await api(`/api/reconciliation-sessions/${session.id}/complete`, 'POST', {}, 400);
  const after = await api(`/api/reconciliation-sessions/${session.id}/summary`);
  assert.equal(after.bookBalance, '0.00'); assert.equal(after.finalDifference, '-10.00'); assert.equal(after.session.status, 'in_progress');
  await page.getByText(summary.warnings[0], { exact: true }).evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${output}/01-legacy-warning-ledger-difference-phone.png`, animations: 'disabled' });
  await completionButton.evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${output}/02-unresolved-completion-blocked-phone.png`, animations: 'disabled' });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ platform: 'Expo web Chromium 390x844', fixture: 'Synthetic pre-fix historical statement/metadata rows inserted only into dedicated verification SQLite; new API fee declaration rejected422', expected: { bookBalance: '0.00', adjustedBookBalance: '0.00', finalDifference: '-10.00', isReconciled: false }, actual: summary, after, completionBlocked: true, completionPostsFromUi, serverCompletionStatus: 400, errors }, null, 2));
  console.log('PASS: real Expo historical warning visible; postedbook0/difference-10; no false completion; new unposted fee rejected422; no page errors.');
} finally { await browser.close(); }
