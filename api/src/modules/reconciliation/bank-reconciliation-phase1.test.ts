import {
  bankMatchingRuleSchema,
  bankReconciliationActionSchema,
  bankTransactionSchema,
  bankTransactionSuggestionResponseSchema,
  bankTransferSchema,
  billSchema,
  financialReportResponseSchema,
  invoiceSchema,
  reconciliationMatchSchema,
  reconciliationSessionSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const cookieHeader = (response: Response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST', headers: jsonHeaders,
    body: JSON.stringify({ name, email: `${crypto.randomUUID()}@example.com`, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return cookieHeader(response);
}

async function createBankAccount(app: ReturnType<typeof createApp>, cookie: string, name: string) {
  const response = await app.request('/api/bank-accounts', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: cookie },
    body: JSON.stringify({ accountName: name, accountNumber: crypto.randomUUID(), bankName: 'Ledger Bank', accountType: 'checking' }),
  });
  expect(response.status).toBe(201);
  return await response.json() as { id: string };
}

async function importTransaction(
  app: ReturnType<typeof createApp>,
  cookie: string,
  bankAccountId: string,
  input: { amount: string; type: 'debit' | 'credit'; description: string; reference?: string },
) {
  const response = await app.request('/api/bank-transactions/import', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: cookie },
    body: JSON.stringify({ bankAccountId, transactions: [{ transactionDate: '2026-11-06', ...input }] }),
  });
  expect(response.status).toBe(201);
  return bankTransactionSchema.parse((await response.json() as { transactions: unknown[] }).transactions[0]);
}

async function seedBusiness(app: ReturnType<typeof createApp>, cookie: string) {
  const profile = await app.request('/api/business-profile', {
    method: 'PUT', headers: { ...jsonHeaders, Cookie: cookie },
    body: JSON.stringify({ name: 'Kauri Studio Ltd', email: 'hello@kauri.example', country: 'NZ', defaultTaxRate: '15', invoiceNumberFormat: 'INV-{YYYY}-{SEQ}', invoiceNumberSequence: 0 }),
  });
  expect(profile.status).toBe(200);
}

async function createIssuedInvoice(app: ReturnType<typeof createApp>, cookie: string, amount: string, customerName: string) {
  const customerResponse = await app.request('/api/customers', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: cookie }, body: JSON.stringify({ name: customerName, email: `${crypto.randomUUID()}@customer.example`, country: 'NZ' }),
  });
  expect(customerResponse.status).toBe(201);
  const customer = await customerResponse.json() as { id: string };
  const invoiceResponse = await app.request('/api/invoices', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: cookie },
    body: JSON.stringify({
      customerId: customer.id, date: '2026-11-06', dueDate: '2026-11-06', taxInclusive: true, taxRate: '0',
      items: [{ description: 'Services', quantity: '1', rate: amount }],
    }),
  });
  expect(invoiceResponse.status).toBe(201);
  const draft = invoiceSchema.parse(await invoiceResponse.json());
  const sentResponse = await app.request(`/api/invoices/${draft.id}`, {
    method: 'PATCH', headers: { ...jsonHeaders, Cookie: cookie }, body: JSON.stringify({ status: 'sent' }),
  });
  expect(sentResponse.status).toBe(200);
  return invoiceSchema.parse(await sentResponse.json());
}

async function createReceivedBill(app: ReturnType<typeof createApp>, cookie: string, amount: string) {
  const accountResponse = await app.request('/api/accounts', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: cookie },
    body: JSON.stringify({ name: 'Office costs', type: 'expense', accountNumber: `6${crypto.randomUUID().slice(0, 3)}`, accountClass: 'expense' }),
  });
  const expenseAccount = await accountResponse.json() as { id: string };
  const vendorResponse = await app.request('/api/vendors', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: cookie }, body: JSON.stringify({ name: 'ACME Supplies' }),
  });
  const vendor = await vendorResponse.json() as { id: string };
  const billResponse = await app.request('/api/bills', {
    method: 'POST', headers: { ...jsonHeaders, Cookie: cookie },
    body: JSON.stringify({
      vendorId: vendor.id, vendorReference: 'ACME-99', issueDate: '2026-11-06', dueDate: '2026-11-06', taxInclusive: true,
      lines: [{ description: 'Supplies', quantity: '1', unitPrice: amount, taxRate: '0', accountId: expenseAccount.id }],
    }),
  });
  expect(billResponse.status).toBe(201);
  const draft = billSchema.parse(await billResponse.json());
  const received = await app.request(`/api/bills/${draft.id}/receive`, { method: 'POST', headers: { ...jsonHeaders, Cookie: cookie }, body: '{}' });
  expect(received.status).toBe(200);
  return billSchema.parse(await received.json());
}

describe('bank reconciliation phase 1', () => {
  it('ranks suggestions, accepts multiple invoices in one journal, rejects excess, and undoes all effects', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Recon owner');
        await seedBusiness(app, owner);
        const bank = await createBankAccount(app, owner, 'Operating');
        const exactInvoice = await createIssuedInvoice(app, owner, '100.00', 'Exact Customer');
        const exactTx = await importTransaction(app, owner, bank.id, { amount: '100.00', type: 'credit', description: `Payment ${exactInvoice.invoiceNumber} Exact Customer`, reference: exactInvoice.invoiceNumber });
        const suggestions = bankTransactionSuggestionResponseSchema.parse(await (await app.request(`/api/bank-transactions/${exactTx.id}/suggestions`, { headers: { Cookie: owner } })).json());
        expect(suggestions.suggestions[0]).toMatchObject({ id: exactInvoice.id, type: 'invoice', score: 100, amount: '100.00' });

        const first = await createIssuedInvoice(app, owner, '60.00', 'First Customer');
        const second = await createIssuedInvoice(app, owner, '40.00', 'Second Customer');
        const transaction = await importTransaction(app, owner, bank.id, { amount: '100.00', type: 'credit', description: 'Combined invoice settlement' });
        const excess = await app.request(`/api/bank-transactions/${transaction.id}/accept`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner },
          body: JSON.stringify({ allocations: [{ documentType: 'invoice', documentId: first.id, amount: '60.00' }, { documentType: 'invoice', documentId: second.id, amount: '40.01' }] }),
        });
        expect(excess.status).toBe(400);

        const acceptedResponse = await app.request(`/api/bank-transactions/${transaction.id}/accept`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner },
          body: JSON.stringify({ allocations: [{ documentType: 'invoice', documentId: first.id, amount: '60.00' }, { documentType: 'invoice', documentId: second.id, amount: '40.00' }] }),
        });
        expect(acceptedResponse.status).toBe(201);
        const accepted = bankReconciliationActionSchema.parse(await acceptedResponse.json());
        expect(accepted.paymentIds).toHaveLength(2);
        expect((await sql.unsafe(`SELECT count(*) AS count FROM journal_entries WHERE reference_type = 'bank_reconciliation_accept' AND reference_id = ?`, [accepted.id]))[0]?.count).toBe(1);
        expect((await sql.unsafe(`SELECT is_reconciled AS value FROM bank_transactions WHERE id = ?`, [transaction.id]))[0]?.value).toBe(1);
        expect((await sql.unsafe(`SELECT amount FROM payments WHERE id IN (?, ?) ORDER BY amount`, accepted.paymentIds)).map((row) => row.amount)).toEqual(['40.00', '60.00']);
        expect((await sql.unsafe(`SELECT count(*) AS count FROM bank_transaction_document_connections WHERE transaction_id = ?`, [transaction.id]))[0]?.count).toBe(2);

        const undoResponse = await app.request(`/api/bank-transactions/${transaction.id}/undo`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner }, body: JSON.stringify({ reason: 'Matched wrong deposit', reversalDate: '2026-11-06' }),
        });
        expect(undoResponse.status).toBe(200);
        expect(bankReconciliationActionSchema.parse(await undoResponse.json()).status).toBe('reversed');
        expect((await sql.unsafe(`SELECT status FROM payments WHERE id IN (?, ?) ORDER BY amount`, accepted.paymentIds)).map((row) => row.status)).toEqual(['refunded', 'refunded']);
        expect((await sql.unsafe(`SELECT count(*) AS count FROM bank_transaction_document_connections WHERE transaction_id = ?`, [transaction.id]))[0]?.count).toBe(0);
        expect((await sql.unsafe(`SELECT is_reconciled AS value FROM bank_transactions WHERE id = ?`, [transaction.id]))[0]?.value).toBe(0);
        expect((await sql.unsafe(`SELECT status FROM journal_entries WHERE id = ?`, [accepted.journalEntryId]))[0]?.status).toBe('reversed');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('books an exact decimal bank fee with a bill payment and supports personal and existing transfer flows', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Fee owner');
        const operating = await createBankAccount(app, owner, 'Operating');
        const savings = await createBankAccount(app, owner, 'Savings');
        const bill = await createReceivedBill(app, owner, '99.00');
        const debit = await importTransaction(app, owner, operating.id, { amount: '100.00', type: 'debit', description: 'ACME Supplies plus fee', reference: 'ACME-99' });
        const sessionResponse = await app.request('/api/reconciliation-sessions', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner },
          body: JSON.stringify({ bankAccountId: operating.id, statementStartDate: '2026-11-01', statementEndDate: '2026-11-30', statementOpeningBalance: '0.00', statementClosingBalance: '-100.00' }),
        });
        const session = reconciliationSessionSchema.parse(await sessionResponse.json());
        const billMatch = await app.request(`/api/reconciliation-sessions/${session.id}/matches`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner },
          body: JSON.stringify({ bankTransactionId: debit.id, bookItemType: 'bill', bookItemId: bill.id }),
        });
        expect(billMatch.status).toBe(201);
        expect(reconciliationMatchSchema.parse(await billMatch.json()).billId).toBe(bill.id);
        const accepted = await app.request(`/api/bank-transactions/${debit.id}/accept`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner },
          body: JSON.stringify({ allocations: [{ documentType: 'bill', documentId: bill.id, amount: '99.00' }], bankFee: '1.00' }),
        });
        expect(accepted.status).toBe(201);
        const action = bankReconciliationActionSchema.parse(await accepted.json());
        expect((await sql.unsafe(`SELECT amount FROM bill_payments WHERE id = ?`, [action.billPaymentIds[0]]))[0]?.amount).toBe('99.00');
        expect((await sql.unsafe(`SELECT debit_amount AS amount FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_entry_id = ? AND a.account_number = '5100'`, [action.journalEntryId]))[0]?.amount).toBe('1.00');
        expect((await sql.unsafe(`SELECT payment_status AS status, balance_due AS balance FROM bills WHERE id = ?`, [bill.id]))[0]).toMatchObject({ status: 'paid', balance: '0.00' });
        const undoneBill = await app.request(`/api/bank-transactions/${debit.id}/undo`, {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner }, body: JSON.stringify({ reason: 'Wrong supplier bill', reversalDate: '2026-11-06' }),
        });
        expect(undoneBill.status).toBe(200);
        expect((await sql.unsafe(`SELECT status, reversal_reason AS reason FROM bill_payments WHERE id = ?`, [action.billPaymentIds[0]]))[0]).toMatchObject({ status: 'reversed', reason: 'Wrong supplier bill' });
        expect((await sql.unsafe(`SELECT payment_status AS status, balance_due AS balance FROM bills WHERE id = ?`, [bill.id]))[0]).toMatchObject({ status: 'unpaid', balance: '99.00' });

        const reportBefore = financialReportResponseSchema.parse(await (await app.request('/api/reports/financial?from=2026-11-01&to=2026-11-30', { headers: { Cookie: owner } })).json());
        const personalTx = await importTransaction(app, owner, operating.id, { amount: '50.00', type: 'debit', description: 'Personal groceries' });
        const personal = await app.request(`/api/bank-transactions/${personalTx.id}/personal`, { method: 'POST', headers: { ...jsonHeaders, Cookie: owner }, body: '{}' });
        expect(personal.status).toBe(201);
        const personalAction = bankReconciliationActionSchema.parse(await personal.json());
        expect((await sql.unsafe(`SELECT account_class AS class FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_entry_id = ? AND a.account_number = '3100'`, [personalAction.journalEntryId]))[0]?.class).toBe('equity');
        const reportAfter = financialReportResponseSchema.parse(await (await app.request('/api/reports/financial?from=2026-11-01&to=2026-11-30', { headers: { Cookie: owner } })).json());
        expect(reportAfter.profitLoss.expenses).toBe(reportBefore.profitLoss.expenses);
        expect(reportAfter.profitLoss.rows.some((row) => row.accountNumber === '3100')).toBe(false);

        const transfer = await app.request('/api/bank-transfers', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: owner, 'Idempotency-Key': 'recon-transfer' },
          body: JSON.stringify({ sourceAccountId: operating.id, destinationAccountId: savings.id, transactionDate: '2026-11-06', amount: '10.00', reference: 'MOVE-1' }),
        });
        expect(transfer.status).toBe(201);
        expect(bankTransferSchema.parse(await transfer.json()).sourceTransaction.isReconciled).toBe(true);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('isolates invoices, bills and matching rules, and rules suggest without auto-posting', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Tenant A');
        const ownerB = await signUp(app, 'Tenant B');
        await seedBusiness(app, ownerA);
        await createIssuedInvoice(app, ownerA, '75.00', 'Private Customer');
        const targetResponse = await app.request('/api/accounts', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ name: 'Fuel', type: 'expense', accountClass: 'expense', accountNumber: '6200' }),
        });
        const target = await targetResponse.json() as { id: string };
        const ruleResponse = await app.request('/api/bank-matching-rules', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA },
          body: JSON.stringify({ descriptionContains: 'ACME Fuel', direction: 'debit', targetAccountId: target.id, amountMin: '10.00', amountMax: '100.00' }),
        });
        expect(ruleResponse.status).toBe(201);
        const rule = bankMatchingRuleSchema.parse(await ruleResponse.json());
        const bankA = await createBankAccount(app, ownerA, 'Tenant A bank');
        const transactionA = await importTransaction(app, ownerA, bankA.id, { amount: '75.00', type: 'debit', description: 'ACME Fuel Auckland' });
        const suggestionsA = bankTransactionSuggestionResponseSchema.parse(await (await app.request(`/api/bank-transactions/${transactionA.id}/suggestions`, { headers: { Cookie: ownerA } })).json());
        expect(suggestionsA.suggestions).toContainEqual(expect.objectContaining({ type: 'matching_rule', matchingRuleId: rule.id, targetAccountId: target.id, amount: '75.00' }));
        const batch = await app.request('/api/bank-transactions/suggestions/batch', {
          method: 'POST', headers: { ...jsonHeaders, Cookie: ownerA }, body: JSON.stringify({ transactionIds: [transactionA.id] }),
        });
        expect((await batch.json() as { items: Array<{ suggestions: unknown[] }> }).items[0]?.suggestions).not.toHaveLength(0);
        const suggestedFeed = await app.request(`/api/bank-transactions?status=suggested&direction=debit&bankAccountId=${bankA.id}&from=2026-11-01&to=2026-11-30&search=ACME&page=1&pageSize=10`, { headers: { Cookie: ownerA } });
        expect((await suggestedFeed.json() as { transactions: Array<{ id: string }>; pagination: { total: number } })).toMatchObject({ transactions: [{ id: transactionA.id }], pagination: { total: 1 } });
        expect((await sql.unsafe(`SELECT is_reconciled AS value FROM bank_transactions WHERE id = ?`, [transactionA.id]))[0]?.value).toBe(0);
        expect((await sql.unsafe(`SELECT count(*) AS count FROM bank_reconciliation_actions WHERE transaction_id = ?`, [transactionA.id]))[0]?.count).toBe(0);

        const updated = await app.request(`/api/bank-matching-rules/${rule.id}`, {
          method: 'PATCH', headers: { ...jsonHeaders, Cookie: ownerA }, body: JSON.stringify({ descriptionContains: 'ACME Energy' }),
        });
        expect(bankMatchingRuleSchema.parse(await updated.json()).descriptionContains).toBe('ACME Energy');
        const bankB = await createBankAccount(app, ownerB, 'Tenant B bank');
        const transactionB = await importTransaction(app, ownerB, bankB.id, { amount: '75.00', type: 'credit', description: 'Private Customer', reference: 'INV-2026-0001' });
        const suggestionsB = bankTransactionSuggestionResponseSchema.parse(await (await app.request(`/api/bank-transactions/${transactionB.id}/suggestions`, { headers: { Cookie: ownerB } })).json());
        expect(suggestionsB.suggestions).toEqual([]);
        await createReceivedBill(app, ownerA, '33.00');
        const debitB = await importTransaction(app, ownerB, bankB.id, { amount: '33.00', type: 'debit', description: 'ACME Supplies', reference: 'ACME-99' });
        expect(bankTransactionSuggestionResponseSchema.parse(await (await app.request(`/api/bank-transactions/${debitB.id}/suggestions`, { headers: { Cookie: ownerB } })).json()).suggestions).toEqual([]);
        expect((await app.request(`/api/bank-transactions/${transactionA.id}/suggestions`, { headers: { Cookie: ownerB } })).status).toBe(404);
        const rulesB = await app.request('/api/bank-matching-rules', { headers: { Cookie: ownerB } });
        expect((await rulesB.json() as { rules: unknown[] }).rules).toEqual([]);
        expect((await app.request(`/api/bank-matching-rules/${rule.id}`, { method: 'DELETE', headers: { Cookie: ownerB } })).status).toBe(404);
        expect((await app.request(`/api/bank-matching-rules/${rule.id}`, { method: 'DELETE', headers: { Cookie: ownerA } })).status).toBe(204);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
