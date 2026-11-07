import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import { bankAccounts } from '../../db/schema/bank';
import { gstSourceClassificationInTx } from './gst-classification';

const period = { from: '2026-10-01', to: '2026-10-31' };
async function reference() {
  const f = await settlementFixture();
  const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
  await f.request('/api/expenses', 'POST', { description: 'Supported receipt', amount: '230', taxAmount: '30', gstTreatment: 'standard', currency: 'NZD', expenseDate: '2026-10-12', status: 'approved' }, 201);
  await f.request('/api/expenses', 'POST', { description: 'Exempt cost', amount: '50', taxAmount: '0', gstTreatment: 'exempt', currency: 'NZD', expenseDate: '2026-10-12', status: 'approved' }, 201);
  const bill = await f.request('/api/bills', 'POST', { vendorId: f.vendor.id, issueDate: '2026-10-15', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Taxable supplier', quantity: '1', unitPrice: '345', taxRate: '15', accountId: f.cost.id }] }, 201);
  await f.request(`/api/bills/${bill.id}/receive`, 'POST', {});
  await f.request(`/api/bills/${bill.id}/payments`, 'POST', { bankAccountId: f.bank.id, amount: '69', paymentDate: '2026-10-20' }, 201);
  return { ...f, organisationId: bank.organisationId, bill };
}

describe('GST source classification never reconstructs gross from rounded GST', () => {
  it('does not treat a declared non-fifteen-percent sales tax as standard GST box evidence', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      const invoice = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '10', items: [{ description: 'Non-standard tax source', quantity: '1', rate: '100', taxes: [{ id: 'non-standard', name: 'Other tax', rate: '10' }] }] }, 201);
      await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      const actual = await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'invoice');
      expect(actual.salesClassificationSupported).toBe(false);
      expect(actual.warnings.join(' ')).toMatch(/non.standard|15%|fifteen/i);
      expect(invoice.taxAmount).toBe('10.00');
      expect((await f.request(`/api/invoices/${invoice.id}`, 'GET')).taxAmount).toBe('10.00');
    } finally { await f.sql.end(); }
  }));
  it('keeps exempt purchases out of eligible gross and allocates actual supplier payments', async () => withTestDb(async () => {
    const f = await reference();
    try {
      expect(await gstSourceClassificationInTx(f.db, f.organisationId, period, 'invoice')).toMatchObject({ claimablePurchases: '575.00', unclassifiedSales: '0.00', warnings: [] });
      expect(await gstSourceClassificationInTx(f.db, f.organisationId, period, 'payments')).toMatchObject({ claimablePurchases: '299.00', unclassifiedSales: '0.00', warnings: [] });
      expect(await gstSourceClassificationInTx(f.db, f.organisationId, period, 'hybrid')).toMatchObject({ claimablePurchases: '299.00' });
      expect(await gstSourceClassificationInTx(f.db, crypto.randomUUID(), period, 'invoice')).toMatchObject({ claimablePurchases: '0.00', unclassifiedSales: '0.00' });
    } finally { await f.sql.end(); }
  }));
  it('uses source gross for a partial/private claim and preserves its own cents', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      await f.request('/api/expenses', 'POST', { description: 'Half claim', amount: '230', taxAmount: '30', gstTreatment: 'partial', gstClaimablePercentage: 50, privateUsePercentage: 0, currency: 'NZD', expenseDate: '2026-10-12', status: 'approved' }, 201);
      await f.request('/api/expenses', 'POST', { description: 'Receipt rounded independently', amount: '100.01', taxAmount: '13.04', gstTreatment: 'standard', currency: 'NZD', expenseDate: '2026-10-12', status: 'approved' }, 201);
      expect(await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'invoice')).toMatchObject({ claimablePurchases: '215.01', warnings: [] });
    } finally { await f.sql.end(); }
  }));
  it('requires explicit zero-rated/exempt review for untaxed sales, including mixed lines and receipts', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      const invoice = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Standard', quantity: '1', rate: '100', taxes: [{ id: 'gst', name: 'GST', rate: '15' }] }, { description: 'Unclassified zero tax', quantity: '1', rate: '50', taxes: [] }] }, 201);
      await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      const payment = await f.request('/api/payments', 'POST', { invoiceId: invoice.id, amount: '82.50', paymentDate: '2026-10-20', paymentMethod: 'bank_transfer' }, 201);
      const accrual = await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'invoice');
      expect(accrual.unclassifiedSales).toBe('50.00');
      expect(accrual.warnings.join(' ')).toMatch(/zero.rated.*exempt|exempt.*zero.rated/i);
      expect((await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'payments')).unclassifiedSales).toBe('25.00');
      expect((await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'hybrid')).unclassifiedSales).toBe('50.00');
      await f.request(`/api/payments/${payment.id}/reverse`, 'POST', { reversalDate: '2026-11-03', reason: 'Bank returned customer receipt' });
      expect((await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'payments')).unclassifiedSales).toBe('25.00');
      expect((await gstSourceClassificationInTx(f.db, bank.organisationId, { from: '2026-11-01', to: '2026-11-30' }, 'payments')).unclassifiedSales).toBe('-25.00');
    } finally { await f.sql.end(); }
  }));
  it('does not fabricate a historical eligible gross after the receipt source is deleted', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      const expense = await f.request('/api/expenses', 'POST', { description: 'Deleted old receipt', amount: '230', taxAmount: '30', gstTreatment: 'standard', currency: 'NZD', expenseDate: '2026-10-12', status: 'approved' }, 201);
      await f.request(`/api/expenses/${expense.id}`, 'DELETE', undefined, 204);
      const actual = await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'invoice');
      expect(actual.claimablePurchases).toBe(null);
      expect(actual.warnings.join(' ')).toMatch(/missing|deleted|historical/i);
    } finally { await f.sql.end(); }
  }));
  it('does not label an unexplained non-standard receipt GST amount as fully eligible fifteen-percent gross', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      await f.request('/api/expenses', 'POST', { description: 'Receipt requiring classification', amount: '230', taxAmount: '15', gstTreatment: 'standard', currency: 'NZD', expenseDate: '2026-10-12', status: 'approved' }, 201);
      const actual = await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'invoice');
      expect(actual.claimablePurchases).toBe(null);
      expect(actual.warnings.join(' ')).toMatch(/non.standard|fifteen|15%|mixed/i);
    } finally { await f.sql.end(); }
  }));
  it('conserves untaxed gross through receivable credits and a later customer refund', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      const invoice = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '0', items: [{ description: 'Unclassified untaxed supply', quantity: '1', rate: '100' }] }, 201);
      await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      const post = async (route: string, body: unknown) => {
        const result = await f.app.request(route, { method: 'POST', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json', Cookie: f.cookie, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
        const value = await result.json() as { id: string };
        expect(result.status, JSON.stringify(value)).toBe(201); return value;
      };
      await post('/api/credit-notes', { invoiceId: invoice.id, issueDate: '2026-10-11', reason: 'Agreed source reduction before receipt', taxInclusive: false, taxRate: '0', items: [{ description: 'Untaxed source credit', quantity: '1', rate: '20' }] });
      expect((await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'invoice')).unclassifiedSales).toBe('80.00');
      await f.request('/api/payments', 'POST', { invoiceId: invoice.id, amount: '80', paymentDate: '2026-10-12', paymentMethod: 'bank_transfer' }, 201);
      const credit = await post('/api/credit-notes', { invoiceId: invoice.id, issueDate: '2026-10-13', reason: 'Agreed source reduction after receipt', taxInclusive: false, taxRate: '0', items: [{ description: 'Untaxed source credit', quantity: '1', rate: '20' }] });
      await post(`/api/credit-notes/${credit.id}/refunds`, { bankAccountId: f.bank.id, amount: '20', refundDate: '2026-10-14' });
      expect((await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'invoice')).unclassifiedSales).toBe('60.00');
      expect((await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'payments')).unclassifiedSales).toBe('60.00');
    } finally { await f.sql.end(); }
  }));
  it('excludes pre-registration source bills and sales even when their payments fall after registration', async () => withTestDb(async () => {
    const f = await reference();
    try {
      const invoice = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '0', items: [{ description: 'Pre-registration untaxed supply', quantity: '1', rate: '100' }] }, 201);
      await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      await f.request('/api/payments', 'POST', { invoiceId: invoice.id, amount: '50', paymentDate: '2026-10-20', paymentMethod: 'bank_transfer' }, 201);
      const actual = await gstSourceClassificationInTx(f.db, f.organisationId, { from: '2026-10-16', to: '2026-10-31' }, 'payments', '2026-10-16');
      expect(actual).toMatchObject({ unclassifiedSales: '0.00', claimablePurchases: '0.00', salesClassificationSupported: true });
      expect(actual.warnings.join(' ')).toMatch(/pre.registration/i);
    } finally { await f.sql.end(); }
  }));
  it('reports unsupported sales classification instead of letting an ordinary review invent discounted mixed-sale facts', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      const invoice = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15', discount: '10', items: [{ description: 'Standard', quantity: '1', rate: '100', taxes: [{ id: 'gst', name: 'GST', rate: '15' }] }, { description: 'Unclassified zero tax', quantity: '1', rate: '50', taxes: [] }] }, 201);
      await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      const actual = await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'invoice');
      expect(actual.salesClassificationSupported).toBe(false);
      expect(actual.warnings.join(' ')).toMatch(/mixed.*discount/i);
    } finally { await f.sql.end(); }
  }));
  it('does not invent source gross for manual GST-control journals', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const [bank] = await f.db.select().from(bankAccounts).where(eq(bankAccounts.id, String(f.bank.id)));
      const input = await f.request('/api/accounts', 'POST', { name: 'GST paid', type: 'asset', accountClass: 'asset', accountNumber: '2150' }, 201);
      const output = await f.request('/api/accounts', 'POST', { name: 'GST collected', type: 'liability', accountClass: 'liability', accountNumber: '2200' }, 201);
      for (const [debitAccountId, creditAccountId, amount] of [[input.id, f.cost.id, '30'], [f.cost.id, output.id, '15']]) {
        const journal = await f.request('/api/journal-entries', 'POST', { entryDate: '2026-10-20', description: 'Accountant tax correction requiring classification', debitAccountId, creditAccountId, amount }, 201);
        await f.request(`/api/journal-entries/${journal.id}`, 'PATCH', { status: 'posted' });
      }
      const actual = await gstSourceClassificationInTx(f.db, bank.organisationId, period, 'invoice');
      expect(actual).toMatchObject({ claimablePurchases: null, salesClassificationSupported: false });
      expect(actual.warnings.join(' ')).toMatch(/manual|unsupported.*source/i);
    } finally { await f.sql.end(); }
  }));
});
