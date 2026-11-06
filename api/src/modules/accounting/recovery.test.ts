import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { openingBalancesResponseSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { accounts, journalEntries, journalEntryLines } from '../../db/schema/accounts';
import { bankAccounts, bankTransactions } from '../../db/schema/bank';
import { bills, billPayments, vendors } from '../../db/schema/purchases';
import { reconciliationMatches, reconciliationSessions } from '../../db/schema/reconciliation';
import { expenses } from '../../db/schema/expenses';
import { organisations, organisationMemberships, users } from '../../db/schema/identity';
import { ORG_A, ORG_B, USER_A, withTestDb } from '../../test/harness';
import type { Database } from '../../db/client';
import { undoReconciliationForUser } from '../reconciliation/reconciliation-actions.service';
import { createMatchForUser } from '../reconciliation/reconciliation.service';
import { postBalancedEntry } from './posting';
import { applyLedgerAuditForUser, auditLedgerForUser, postOpeningBalancesForUser } from './recovery.service';

const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
async function evidence(name: string, value: unknown) {
  const directory = process.env.ACCOUNTING_EVIDENCE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n');
}

async function seed(db: Database) {
  await db.insert(users).values([{ id: USER_A, name: 'Accountant', email: 'audit@example.test' }, { id: USER_B, name: 'Other', email: 'other@example.test' }]);
  await db.insert(organisations).values([{ id: ORG_A, name: 'Audit company' }, { id: ORG_B, name: 'Other company' }]);
  await db.insert(organisationMemberships).values([{ organisationId: ORG_A, userId: USER_A, role: 'owner' }, { organisationId: ORG_B, userId: USER_B, role: 'owner' }]);
  const rows = await db.insert(accounts).values([
    { organisationId: ORG_A, userId: USER_A, accountNumber: '1110', name: 'Cash', type: 'bank', accountClass: 'asset', openingBalance: '5000' },
    { organisationId: ORG_A, userId: USER_A, accountNumber: '3000', name: 'Capital', type: 'equity', accountClass: 'equity' },
    { organisationId: ORG_A, userId: USER_A, accountNumber: '2150', name: 'GST Input', type: 'asset', accountClass: 'asset' },
    { organisationId: ORG_A, userId: USER_A, accountNumber: '5000', name: 'Costs', type: 'expense', accountClass: 'expense' },
    { organisationId: ORG_A, userId: USER_A, accountNumber: '2100', name: 'Payables', type: 'liability', accountClass: 'liability' },
    { organisationId: ORG_B, userId: USER_B, accountNumber: '1110', name: 'Other cash', type: 'bank', accountClass: 'asset' },
  ]).returning();
  return { cash: rows[0]!.id, capital: rows[1]!.id, gst: rows[2]!.id, cost: rows[3]!.id, ap: rows[4]!.id, other: rows[5]!.id };
}
async function balance(db: Database, accountId: string) {
  const rows = await db.select().from(journalEntryLines).where(eq(journalEntryLines.accountId, accountId));
  const { decimal, roundMoney } = await import('../invoices/money');
  return roundMoney(rows.reduce((sum, row) => sum.add(row.debitAmount).sub(row.creditAmount), decimal(0)));
}

describe('reviewed opening balances and historical ledger recovery', () => {
  it('posts reviewed opening balances once, never synthesizes opening metadata, and rejects changed duplicate', async () => withTestDb(async ({ db }) => {
    const ids = await seed(db);
    expect(await balance(db, ids.cash)).toBe('0.00');
    const input = { date: '2026-04-01', reference: 'Opening verified against prior accounts', reviewed: true as const, lines: [
      { accountId: ids.cash, debit: '5000.00', credit: '0' }, { accountId: ids.capital, debit: '0', credit: '5000' },
    ] };
    const first = await postOpeningBalancesForUser(db, USER_A, input);
    expect(first.total).toBe('5000.00');
    expect(first.replayed).toBe(false);
    const second = await postOpeningBalancesForUser(db, USER_A, input);
    expect(second.journalEntryId).toBe(first.journalEntryId);
    expect(second.replayed).toBe(true);
    expect(await balance(db, ids.cash)).toBe('5000.00');
    expect(await balance(db, ids.capital)).toBe('-5000.00');
    await evidence('opening-balances.json', { metadataOpening: '5000.00', beforePosted: '0.00', expected: { cash: '5000.00', capital: '-5000.00', total: '5000.00' }, actual: { cash: await balance(db, ids.cash), capital: await balance(db, ids.capital), total: first.total }, first, replay: second });
    await expect(postOpeningBalancesForUser(db, USER_A, { ...input, reference: 'Different opening' })).rejects.toThrow('already');
    expect(await auditLedgerForUser(db, USER_B)).toEqual({ findings: [], warnings: [] });
  }));

  it('rejects unbalanced, cross-company, inactive, non-NZD and double-sided opening lines', async () => withTestDb(async ({ db }) => {
    const ids = await seed(db);
    const input = { date: '2026-04-01', reference: 'Opening', reviewed: true as const, lines: [{ accountId: ids.cash, debit: '10', credit: '0' }, { accountId: ids.capital, debit: '0', credit: '9' }] };
    await expect(postOpeningBalancesForUser(db, USER_A, input)).rejects.toThrow('balance');
    await expect(postOpeningBalancesForUser(db, USER_A, { ...input, lines: [{ accountId: ids.other, debit: '9', credit: '0' }, input.lines[1]!] })).rejects.toThrow('account');
    await db.update(accounts).set({ isActive: false }).where(eq(accounts.id, ids.cash));
    await expect(postOpeningBalancesForUser(db, USER_A, { ...input, lines: [{ accountId: ids.cash, debit: '9', credit: '0' }, input.lines[1]!] })).rejects.toThrow('active');
    await db.update(accounts).set({ isActive: true, currency: 'USD' }).where(eq(accounts.id, ids.cash));
    await expect(postOpeningBalancesForUser(db, USER_A, input)).rejects.toThrow('NZD');
    await db.update(accounts).set({ currency: 'NZD' }).where(eq(accounts.id, ids.cash));
    await expect(postOpeningBalancesForUser(db, USER_A, { ...input, lines: [{ accountId: ids.cash, debit: '10', credit: '1' }, input.lines[1]!] })).rejects.toThrow('one side');
  }));

  it('previews and corrects only confirmed receipt GST; cash and immutable original remain unchanged; replay does not double-post', async () => withTestDb(async ({ db }) => {
    const ids = await seed(db);
    const [expense] = await db.insert(expenses).values({ organisationId: ORG_A, userId: USER_A, description: 'Historic partly private receipt', amount: '230', taxAmount: '30', baseAmount: '230', baseTaxAmount: '30', gstTreatment: 'partial', gstClaimablePercentage: 50, expenseDate: '2026-04-12', status: 'approved' }).returning();
    const source = await postBalancedEntry(db, { organisationId: ORG_A, userId: USER_A }, { date: '2026-04-12', description: 'Legacy approved expense', referenceType: 'expense', referenceId: expense!.id, lines: [
      { accountId: ids.cost, description: '', debit: '200', credit: '0' }, { accountId: ids.gst, description: '', debit: '30', credit: '0' }, { accountId: ids.cash, description: '', debit: '0', credit: '230' },
    ] });
    const before = await db.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, source));
    const preview = await auditLedgerForUser(db, USER_A);
    expect(preview.findings).toHaveLength(1);
    const finding = preview.findings[0]!;
    expect(finding.type).toBe('expense_gst');
    expect(finding.actual.inputGst).toBe('30.00');
    expect(finding.expected.inputGst).toBe('15.00');
    expect(finding.expected.expenseCost).toBe('215.00');
    const input = { date: '2026-05-01', reason: 'Receipt reviewed by accountant', reviewed: true as const, findings: [{ key: finding.key, fingerprint: finding.fingerprint }] };
    await expect(applyLedgerAuditForUser(db, USER_A, input)).rejects.toThrow('receipt');
    const confirmed = { ...input, findings: [{ ...input.findings[0]!, receiptGstConfirmed: true as const }] };
    await expect(applyLedgerAuditForUser(db, USER_A, { ...confirmed, date: '2026-04-01' })).rejects.toThrow('date');
    await expect(applyLedgerAuditForUser(db, USER_A, { ...confirmed, findings: [...confirmed.findings, { key: 'missing', fingerprint: 'a'.repeat(64) }] })).rejects.toThrow('available');
    expect(await balance(db, ids.gst)).toBe('30.00'); // Entire batch rolls back.
    const applied = await applyLedgerAuditForUser(db, USER_A, confirmed);
    expect(applied.corrections[0]!.replayed).toBe(false);
    expect(await balance(db, ids.gst)).toBe('15.00');
    expect(await balance(db, ids.cost)).toBe('215.00');
    expect(await balance(db, ids.cash)).toBe('-230.00');
    expect(await db.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, source))).toEqual(before);
    const replay = await applyLedgerAuditForUser(db, USER_A, confirmed);
    expect(replay.corrections[0]!.journalEntryId).toBe(applied.corrections[0]!.journalEntryId);
    expect(replay.corrections[0]!.replayed).toBe(true);
    expect((await auditLedgerForUser(db, USER_A)).findings).toEqual([]);
    await evidence('expense-gst-correction.json', { before: { inputGst: '30.00', cost: '200.00', cash: '-230.00' }, proposal: finding, expected: { inputGst: '15.00', cost: '215.00', cash: '-230.00' }, actual: { inputGst: await balance(db, ids.gst), cost: await balance(db, ids.cost), cash: await balance(db, ids.cash) }, correction: applied, replay, originalSourceUnchanged: true, receiptConfirmationRequired: true });
    await expect(applyLedgerAuditForUser(db, USER_B, confirmed)).rejects.toThrow('available');
  }));

  it('moves a proved historical supplier payment to its selected bank without touching AP or creating preview accounts', async () => withTestDb(async ({ db }) => {
    const ids = await seed(db);
    const [bank] = await db.insert(bankAccounts).values({ organisationId: ORG_A, userId: USER_A, accountName: 'Operating', accountNumber: '01-001', bankName: 'Test bank', accountType: 'business' }).returning();
    const [vendor] = await db.insert(vendors).values({ organisationId: ORG_A, userId: USER_A, name: 'Supplier' }).returning();
    const [bill] = await db.insert(bills).values({ organisationId: ORG_A, userId: USER_A, billNumber: 'B-1', vendorId: vendor!.id, issueDate: '2026-04-10', dueDate: '2026-04-30', lifecycleStatus: 'received', subtotal: '300', taxAmount: '45', total: '345', balanceDue: '276', totalPaid: '69' }).returning();
    const [payment] = await db.insert(billPayments).values({ organisationId: ORG_A, userId: USER_A, billId: bill!.id, bankAccountId: bank!.id, amount: '69', paymentDate: '2026-04-20' }).returning();
    const sourceId = await postBalancedEntry(db, { organisationId: ORG_A, userId: USER_A }, { date: '2026-04-20', description: 'Legacy selected-bank payment', referenceType: 'bill_payment', referenceId: payment!.id, lines: [{ accountId: ids.ap, description: '', debit: '69', credit: '0' }, { accountId: ids.cash, description: '', debit: '0', credit: '69' }] });
    const original = await db.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, sourceId));
    const beforeAccounts = await db.select().from(accounts);
    const preview = await auditLedgerForUser(db, USER_A);
    expect(preview.findings).toHaveLength(1);
    expect(preview.findings[0]!.type).toBe('supplier_bank');
    expect(await db.select().from(accounts)).toEqual(beforeAccounts);
    const finding = preview.findings[0]!;
    await applyLedgerAuditForUser(db, USER_A, { date: '2026-05-01', reason: 'Compare selected bank with supplier remittance', reviewed: true, findings: [{ key: finding.key, fingerprint: finding.fingerprint }] });
    const [target] = await db.select().from(accounts).where(eq(accounts.accountNumber, `BANK-${bank!.id.slice(0, 8).toUpperCase()}`));
    expect(await balance(db, ids.cash)).toBe('0.00');
    expect(await balance(db, target!.id)).toBe('-69.00');
    expect(await balance(db, ids.ap)).toBe('69.00');
    await evidence('supplier-bank-correction.json', { before: { genericCash: '-69.00', selectedBank: '0.00', ap: '69.00' }, proposal: finding, expected: { genericCash: '0.00', selectedBank: '-69.00', ap: '69.00' }, actual: { genericCash: await balance(db, ids.cash), selectedBank: await balance(db, target!.id), ap: await balance(db, ids.ap) }, previewAccountCountUnchanged: true, sourceJournalUnchanged: true });
    expect(await db.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, sourceId))).toEqual(original);
    expect((await auditLedgerForUser(db, USER_A)).findings).toEqual([]);
  }));

  it('corrects a proved legacy expense match duplicate once, preserving original receipt GST and settlement', async () => withTestDb(async ({ db }) => {
    const ids = await seed(db);
    const [bank] = await db.insert(bankAccounts).values({ organisationId: ORG_A, userId: USER_A, accountName: 'Statement bank', accountNumber: '02-001', bankName: 'Test bank', accountType: 'business' }).returning();
    const [bankLedger] = await db.insert(accounts).values({ organisationId: ORG_A, userId: USER_A, accountNumber: `BANK-${bank!.id.slice(0, 8).toUpperCase()}`, name: 'Statement bank', type: 'bank', accountClass: 'asset' }).returning();
    const [expense] = await db.insert(expenses).values({ organisationId: ORG_A, userId: USER_A, description: 'Original receipt', amount: '230', taxAmount: '30', baseAmount: '230', baseTaxAmount: '30', expenseDate: '2026-04-12', status: 'approved' }).returning();
    const original = await postBalancedEntry(db, { organisationId: ORG_A, userId: USER_A }, { date: '2026-04-12', description: 'Original receipt', referenceType: 'expense', referenceId: expense!.id, lines: [{ accountId: ids.cost, description: '', debit: '200', credit: '0' }, { accountId: ids.gst, description: '', debit: '30', credit: '0' }, { accountId: ids.cash, description: '', debit: '0', credit: '230' }] });
    const [transaction] = await db.insert(bankTransactions).values({ organisationId: ORG_A, userId: USER_A, bankAccountId: bank!.id, transactionDate: '2026-04-12', description: 'Imported receipt payment', amount: '230', type: 'debit', isReconciled: true }).returning();
    await postBalancedEntry(db, { organisationId: ORG_A, userId: USER_A }, { date: '2026-04-12', description: transaction!.description, referenceType: 'bank_transaction', referenceId: transaction!.id, lines: [{ accountId: ids.cost, description: '', debit: '230', credit: '0' }, { accountId: bankLedger!.id, description: '', debit: '0', credit: '230' }] });
    const [session] = await db.insert(reconciliationSessions).values({ organisationId: ORG_A, userId: USER_A, bankAccountId: bank!.id, statementStartDate: '2026-04-01', statementEndDate: '2026-04-30', statementOpeningBalance: '0', statementClosingBalance: '-230', bookOpeningBalance: '0' }).returning();
    await db.insert(reconciliationMatches).values({ organisationId: ORG_A, reconciliationId: session!.id, bankTransactionId: transaction!.id, expenseId: expense!.id, matchType: 'manual', status: 'confirmed', bankAmount: '230', bookAmount: '230' });
    expect(await balance(db, ids.cost)).toBe('430.00');
    const finding = (await auditLedgerForUser(db, USER_A)).findings[0]!;
    expect(finding.type).toBe('duplicate_bank_posting');
    const request = { date: '2026-05-01', reason: 'Matched original expense already posted', reviewed: true as const, findings: [{ key: finding.key, fingerprint: finding.fingerprint }] };
    await applyLedgerAuditForUser(db, USER_A, request);
    expect(await balance(db, ids.cost)).toBe('200.00');
    expect(await balance(db, ids.gst)).toBe('30.00');
    expect(await balance(db, ids.cash)).toBe('0.00');
    expect(await balance(db, bankLedger!.id)).toBe('-230.00');
    expect((await applyLedgerAuditForUser(db, USER_A, request)).corrections[0]!.replayed).toBe(true);
    expect((await db.select().from(journalEntries).where(eq(journalEntries.id, original)))[0]!.status).toBe('posted');
    await undoReconciliationForUser(db, USER_A, transaction!.id, { reversalDate: '2026-05-02', reason: 'Review statement match again' });
    expect(await balance(db, ids.cost)).toBe('430.00');
    expect(await balance(db, ids.cash)).toBe('-230.00');
    await expect(applyLedgerAuditForUser(db, USER_A, request)).rejects.toThrow('reversed');
    await createMatchForUser(db, USER_A, session!.id, { bankTransactionId: transaction!.id, bookItemType: 'expense', bookItemId: expense!.id, matchType: 'manual', status: 'confirmed' });
    expect(await balance(db, ids.cost)).toBe('200.00');
    expect(await balance(db, ids.cash)).toBe('0.00');
    expect(await balance(db, bankLedger!.id)).toBe('-230.00');
    expect(await balance(db, ids.gst)).toBe('30.00');
    await evidence('duplicate-bank-correction.json', { before: { cost: '430.00', cashCombined: '-460.00', gst: '30.00' }, proposal: finding, expected: { cost: '200.00', genericCash: '0.00', statementBank: '-230.00', gst: '30.00' }, actual: { cost: await balance(db, ids.cost), genericCash: await balance(db, ids.cash), statementBank: await balance(db, bankLedger!.id), gst: await balance(db, ids.gst) }, undoRestoredCost: '430.00', rematchCorrectedOnce: true, originalExpenseUnchanged: true });

  }));

  it('rejects stale audit fingerprints before any corrections are posted', async () => withTestDb(async ({ db }) => {
    const ids = await seed(db);
    await db.insert(expenses).values({ id: 'legacy', organisationId: ORG_A, userId: USER_A, description: 'Legacy', amount: '230', taxAmount: '30', baseAmount: '230', baseTaxAmount: '30', gstClaimablePercentage: 50, expenseDate: '2026-04-12', status: 'approved' });
    await postBalancedEntry(db, { organisationId: ORG_A, userId: USER_A }, { date: '2026-04-12', description: 'Legacy', referenceType: 'expense', referenceId: 'legacy', lines: [{ accountId: ids.cost, description: '', debit: '200', credit: '0' }, { accountId: ids.gst, description: '', debit: '30', credit: '0' }, { accountId: ids.cash, description: '', debit: '0', credit: '230' }] });
    const finding = (await auditLedgerForUser(db, USER_A)).findings[0]!;
    await db.update(expenses).set({ gstClaimablePercentage: 75 }).where(eq(expenses.id, 'legacy'));
    await expect(applyLedgerAuditForUser(db, USER_A, { date: '2026-05-01', reason: 'Review', reviewed: true, findings: [{ key: finding.key, fingerprint: finding.fingerprint, receiptGstConfirmed: true }] })).rejects.toThrow('changed');
    expect(await balance(db, ids.gst)).toBe('30.00');
  }));
  it('flags historical foreign-currency raw postings for manual review instead of inventing corrective rates', async () => withTestDb(async ({ db }) => {
    const ids = await seed(db);
    const [vendor] = await db.insert(vendors).values({ organisationId: ORG_A, userId: USER_A, name: 'Foreign supplier' }).returning();
    const [bill] = await db.insert(bills).values({ organisationId: ORG_A, userId: USER_A, billNumber: 'USD-LEGACY', vendorId: vendor!.id, issueDate: '2026-04-10', dueDate: '2026-04-30', lifecycleStatus: 'received', currency: 'USD', baseCurrency: 'NZD', exchangeRate: '1.60', baseTotal: '160', subtotal: '100', taxAmount: '0', total: '100', balanceDue: '100' }).returning();
    await postBalancedEntry(db, { organisationId: ORG_A, userId: USER_A }, { date: '2026-04-10', description: 'Legacy foreign raw amount', referenceType: 'bill', referenceId: bill!.id, lines: [{ accountId: ids.cost, description: '', debit: '100', credit: '0' }, { accountId: ids.ap, description: '', debit: '0', credit: '100' }] });
    const result = await auditLedgerForUser(db, USER_A);
    expect(result.findings).toEqual([]);
    expect(result.warnings.join(' ')).toContain('base-currency snapshot');
    expect(await balance(db, ids.ap)).toBe('-100.00');
  }));

  it('exposes real HTTP opening/audit routes with authentication, schema validation and banking permissions', async () => withTestDb(async ({ db }) => {
    const { sql } = createDb(getDatabaseUrl());
    try {
      const app = createApp({ db, auth: createAuth(db) });
      expect((await app.request('/api/journal-entries/ledger-audit')).status).toBe(401);
      const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
      const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Opening owner', email: 'opening-owner@example.test', password: 'LocalOpening123!' }) });
      expect(signup.status).toBe(200);
      const user = await signup.json() as { user: { id: string } };
      const cookie = signup.headers.getSetCookie().map((row) => row.split(';')[0]).join('; ');
      const authenticated = { ...headers, Cookie: cookie };
      const initialized = await app.request('/api/accounts/initialize', { method: 'POST', headers: authenticated, body: '{}' });
      expect(initialized.status).toBe(200);
      const data = await initialized.json() as { accounts: Array<{ id: string; accountNumber: string }> };
      const cash = data.accounts.find((row) => row.accountNumber === '1110')!;
      const capitalResponse = await app.request('/api/accounts', { method: 'POST', headers: authenticated, body: JSON.stringify({ name: 'Opening capital', type: 'custom', accountNumber: '3000', accountClass: 'equity' }) });
      expect(capitalResponse.status).toBe(201);
      const capital = await capitalResponse.json() as { id: string };
      const input = { date: '2026-04-01', reference: 'Prior accountant approved trial balance', reviewed: true, lines: [{ accountId: cash.id, debit: '5000.00', credit: '0.00' }, { accountId: capital.id, debit: '0.00', credit: '5000.00' }] };
      const rejected = await app.request('/api/journal-entries/opening-balances', { method: 'POST', headers: authenticated, body: JSON.stringify({ ...input, reviewed: false }) });
      expect(rejected.status).toBe(400);
      const created = await app.request('/api/journal-entries/opening-balances', { method: 'POST', headers: authenticated, body: JSON.stringify(input) });
      expect(created.status).toBe(201);
      expect(openingBalancesResponseSchema.parse(await created.json())).toMatchObject({ total: '5000.00', replayed: false });
      expect(await balance(db, cash.id)).toBe('5000.00');
      const audit = await app.request('/api/journal-entries/ledger-audit', { headers: authenticated });
      expect(audit.status).toBe(200);
      expect(await audit.json()).toEqual({ findings: [], warnings: [] });
      await db.update(organisationMemberships).set({ role: 'read_only' }).where(eq(organisationMemberships.userId, user.user.id));
      expect((await app.request('/api/journal-entries/ledger-audit', { headers: authenticated })).status).toBe(200);
      expect((await app.request('/api/journal-entries/opening-balances', { method: 'POST', headers: authenticated, body: JSON.stringify(input) })).status).toBe(403);
      expect((await app.request('/api/journal-entries/ledger-audit/apply', { method: 'POST', headers: authenticated, body: JSON.stringify({ date: '2026-05-01', reason: 'Read-only cannot apply', reviewed: true, findings: [{ key: 'missing', fingerprint: 'a'.repeat(64) }] }) })).status).toBe(403);
    } finally { await sql.end(); }
  }));

});
