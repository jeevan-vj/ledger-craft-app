import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';

describe('unsupported native foreign bank statement writes', () => {
  it.each(['import', 'manual', 'accept_invoice', 'accept_bill', 'personal', 'duplicate', 'details'] as const)('rejects %s rather than booking native USD as NZD', async (operation) => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const bank = await f.request('/api/bank-accounts', 'POST', { accountName: 'USD bank', accountNumber: crypto.randomUUID(), bankName: 'Test Bank', accountType: 'checking', currency: 'USD' }, 201);
      const transaction = { transactionDate: '2026-10-20', amount: '100', type: operation === 'accept_bill' ? 'debit' : 'credit', description: 'Legacy USD statement' };
      if (operation === 'import') await f.request('/api/bank-transactions/import', 'POST', { bankAccountId: bank.id, transactions: [transaction] }, 422);
      else if (operation === 'manual') await f.request('/api/bank-transactions', 'POST', { bankAccountId: bank.id, ...transaction }, 422);
      else {
        // Already stored native rows may exist from the previous application.
        // They remain readable for audit, but must not bypass the new guard.
        const id = crypto.randomUUID();
        await f.sql.unsafe(`INSERT INTO bank_transactions (id,organisation_id,user_id,bank_account_id,transaction_date,description,amount,type,source) SELECT ?,organisation_id,user_id,id,?,?,?,?,'import' FROM bank_accounts WHERE id=?`, [id, transaction.transactionDate, transaction.description, transaction.amount, transaction.type, bank.id]);
        let path = `/api/bank-transactions/${id}/accept`;
        let method = 'POST';
        let body: unknown = {};
        if (operation === 'accept_bill') {
          await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
          body = { allocations: [{ documentType: 'bill', documentId: f.bill.id, amount: '100' }] };
        } else if (operation === 'accept_invoice' || operation === 'details') {
          await f.request(`/api/invoices/${f.invoice.id}`, 'PATCH', { status: 'sent' });
          body = operation === 'details' ? { documentConnections: [{ documentType: 'invoice', documentId: f.invoice.id, amount: '100' }], splits: [], attachments: [] } : { allocations: [{ documentType: 'invoice', documentId: f.invoice.id, amount: '100' }] };
          if (operation === 'details') { path = `/api/bank-transactions/${id}/details`; method = 'PUT'; }
        } else path = `/api/bank-transactions/${id}/${operation}`;
        const countBefore = (await f.sql.unsafe('SELECT count(*) AS n FROM journal_entries'))[0]?.n;
        await f.request(path, method, body, 422);
        expect((await f.sql.unsafe('SELECT count(*) AS n FROM journal_entries'))[0]?.n).toBe(countBefore);
        expect((await f.sql.unsafe('SELECT is_reconciled AS state FROM bank_transactions WHERE id=?', [id]))[0]?.state).toBe(0);
      }
      expect((await f.sql.unsafe('SELECT count(*) AS n FROM payments'))[0]?.n).toBe(0);
      expect((await f.sql.unsafe('SELECT count(*) AS n FROM bill_payments'))[0]?.n).toBe(0);
      if (operation === 'import' || operation === 'manual') expect((await f.sql.unsafe('SELECT count(*) AS n FROM bank_transactions'))[0]?.n).toBe(0);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));
});
