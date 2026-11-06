import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';

/** Focused payment integration fixture: an issued source credit already exists.
 * Full issuance/journal/refund behavior is verified by the credit-note suite. */
async function creditedInvoice() {
  const f = await settlementFixture();
  const paid = await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '50', paymentDate: '2026-10-20', paymentMethod: 'bank_transfer', exchangeRateId: f.rate.id }, 201);
  await f.sql.unsafe(`INSERT INTO credit_notes (id,organisation_id,user_id,invoice_id,customer_id,credit_note_number,issue_date,reason,currency,exchange_rate,exchange_rate_id,base_currency,subtotal,tax_amount,total,base_total,base_tax_amount,receivable_amount,base_receivable_amount,customer_credit_amount,base_customer_credit_amount,base_customer_credit_tax_amount) SELECT ?,organisation_id,user_id,id,customer_id,'CN-FIXTURE','2026-10-21','Cancelled part of the service',currency,exchange_rate,exchange_rate_id,base_currency,'20.00','0.00','20.00','32.00','0.00','20.00','32.00','0.00','0.00','0.00' FROM invoices WHERE id=?`, [crypto.randomUUID(), f.invoice.id]);
  await f.sql.unsafe(`UPDATE invoices SET total_credited='20.00',base_credited='32.00',balance_due='30.00' WHERE id=?`, [f.invoice.id]);
  return { ...f, paid };
}

describe('invoice payment state after an issued credit note', () => {
  it('collects only the remaining30 after original100, cash50 and credit20', async () => withTestDb(async () => {
    const f = await creditedInvoice();
    try {
      const final = await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '30', paymentDate: '2026-10-22', paymentMethod: 'bank_transfer', exchangeRateId: f.rate.id }, 201);
      expect(final).toMatchObject({ amount: '30.00', baseAmount: '49.50', bookBaseAmount: '48.00' });
      const invoice = await f.request(`/api/invoices/${f.invoice.id}`, 'GET');
      expect(invoice).toMatchObject({ totalPaid: '80.00', totalCredited: '20.00', balanceDue: '0.00', paymentStatus: 'paid' });
      await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '0.01', paymentDate: '2026-10-22', paymentMethod: 'bank_transfer' }, 400);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));
  it('requires reversing an active credit note before reversing the original receipt', async () => withTestDb(async () => {
    const f = await creditedInvoice();
    try {
      await f.request(`/api/payments/${f.paid.id}/reverse`, 'POST', { reversalDate: '2026-10-22', reason: 'Reverse the original receipt' }, 409);
      expect((await f.request(`/api/invoices/${f.invoice.id}`, 'GET')).balanceDue).toBe('30.00');
      expect((await f.sql.unsafe('SELECT status FROM payments WHERE id=?', [f.paid.id]))[0]?.status).toBe('completed');
    } finally { await f.sql.end({ timeout: 5 }); }
  }));
  it('rejects backdated cash that would change an already allocated credit note', async () => withTestDb(async () => {
    const f = await creditedInvoice();
    try {
      await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '10', paymentDate: '2026-10-20', paymentMethod: 'bank_transfer', exchangeRateId: f.rate.id }, 409);
      expect((await f.request(`/api/invoices/${f.invoice.id}`, 'GET')).balanceDue).toBe('30.00');
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

});
