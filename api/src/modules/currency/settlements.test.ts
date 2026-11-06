import { describe, expect, it } from 'vitest';
import type { BillPaymentBatchDto, FinancialReportResponse } from '@ledgercraft/contracts';
import { withTestDb } from '../../test/harness';

import { settlementFixture as fixture } from './settlement.test-helper';

describe('foreign receivable and payable settlements', () => {
  it('posts USD100 at NZD160, clears receivable160 against cash165 and realized gain5', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const paid = await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentMethod: 'bank_transfer', paymentDate: '2026-10-20', exchangeRateId: f.rate.id }, 201);
      expect(paid).toMatchObject({ amount: '100.00', currency: 'USD', baseCurrency: 'NZD', baseAmount: '165.00', bookBaseAmount: '160.00', exchangeDifference: '5.00', exchangeRateId: f.rate.id });
      await f.request(`/api/exchange-rates/${f.rate.id}`, 'DELETE', undefined, 409);
      const lines = await f.sql.unsafe(`SELECT a.account_number AS code,l.debit_amount AS debit,l.credit_amount AS credit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id JOIN accounts a ON a.id=l.account_id WHERE j.reference_type='invoice_payment' AND j.reference_id=?`, [paid.id]);
      expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ code: '1200', credit: '160.00' }), expect.objectContaining({ code: '4200', credit: '5.00' })]));
      const source = await f.sql.unsafe(`SELECT total_amount AS total FROM journal_entries WHERE reference_type='invoice' AND reference_id=?`, [f.invoice.id]);
      expect(source[0]?.total).toBe('160.00');
      const report = await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-10-01&to=2026-10-31', 'GET');
      expect(report.balanceSheet.balanced).toBe(true);
      expect(report.trialBalance.balanced).toBe(true);
      expect(report.cashFlow.closingCash).toBe('165.00');
      expect(report.profitLoss).toMatchObject({ revenue: '165.00', expenses: '0.00', netIncome: '165.00' });
      const balances = await f.sql.unsafe(`SELECT l.debit_amount AS debit,l.credit_amount AS credit FROM journal_entry_lines l JOIN accounts a ON a.id=l.account_id WHERE a.account_number='1200'`);
      expect(balances).toEqual(expect.arrayContaining([expect.objectContaining({ debit: '160.00' }),expect.objectContaining({ credit: '160.00' })]));
      const reversed = await f.request(`/api/payments/${paid.id}/reverse`, 'POST', { reason: 'Duplicate receipt', reversalDate: '2026-10-21' });
      expect(reversed.status).toBe('refunded');
      expect((await f.request(`/api/invoices/${f.invoice.id}`, 'GET')).balanceDue).toBe('100.00');
      const gainReversal = await f.sql.unsafe(`SELECT l.debit_amount AS debit,l.credit_amount AS credit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id JOIN accounts a ON a.id=l.account_id WHERE j.reference_type='invoice_payment_reversal' AND j.reference_id=(SELECT id FROM journal_entries WHERE reference_type='invoice_payment' AND reference_id=?) AND a.account_number='4200'`, [paid.id]);
      expect(gainReversal[0]).toMatchObject({ debit: '5.00', credit: '0.00' });
      const reopened = await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-10-01&to=2026-10-31', 'GET');
      expect(reopened.cashFlow.closingCash).toBe('0.00');
      expect(reopened.profitLoss.netIncome).toBe('160.00');
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('posts USD100 payable160 and pays cash165 with realized loss5', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
      const result = await f.request<BillPaymentBatchDto>(`/api/bills/${f.bill.id}/payments`, 'POST', { bankAccountId: f.bank.id, amount: '100', paymentDate: '2026-10-20', exchangeRateId: f.rate.id }, 201);
      const paid = result.payments[0];
      expect(paid).toMatchObject({ amount: '100.00', currency: 'USD', baseAmount: '165.00', bookBaseAmount: '160.00', exchangeDifference: '5.00' });
      const lines = await f.sql.unsafe(`SELECT a.account_number AS code,l.debit_amount AS debit,l.credit_amount AS credit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id JOIN accounts a ON a.id=l.account_id WHERE j.reference_type='bill_payment' AND j.reference_id=?`, [paid.id]);
      expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ code: '2100', debit: '160.00' }),expect.objectContaining({ code: '5200', debit: '5.00' })]));
      const source = await f.sql.unsafe(`SELECT total_amount AS total FROM journal_entries WHERE reference_type='bill' AND reference_id=?`, [f.bill.id]);
      expect(source[0]?.total).toBe('160.00');
      const report = await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-10-01&to=2026-10-31', 'GET');
      expect(report.balanceSheet.balanced).toBe(true);
      expect(report.trialBalance.balanced).toBe(true);
      expect(report.cashFlow.closingCash).toBe('-165.00');
      expect(report.profitLoss).toMatchObject({ revenue: '0.00', expenses: '165.00', netIncome: '-165.00' });
      expect((await f.request(`/api/bills/${f.bill.id}`, 'GET')).balanceDue).toBe('0.00');
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('cancels and restores foreign sources using the original NZD160 journals', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await f.request(`/api/invoices/${f.invoice.id}`, 'PATCH', { status: 'sent' });
      await f.request(`/api/invoices/${f.invoice.id}/cancel`, 'POST', {});
      await f.request(`/api/invoices/${f.invoice.id}/restore`, 'POST', {});
      await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
      await f.request(`/api/bills/${f.bill.id}/cancel`, 'POST', {});
      await f.request(`/api/bills/${f.bill.id}/restore`, 'POST', {});
      const movement = await f.sql.unsafe(`SELECT reference_type AS type,total_amount AS total FROM journal_entries WHERE reference_id IN (?,?) ORDER BY reference_type`, [f.invoice.id, f.bill.id]);
      expect(movement).toHaveLength(6);
      expect(movement.every((row) => row.total === '160.00')).toBe(true);
      const gl = await f.sql.unsafe(`SELECT j.reference_type AS type,a.account_number AS code,l.debit_amount AS debit,l.credit_amount AS credit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id JOIN accounts a ON a.id=l.account_id WHERE j.reference_type='invoice_cancellation' AND j.reference_id=? AND a.account_number='1200'`, [f.invoice.id]);
      expect(gl[0]).toMatchObject({ credit: '160.00' });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('clears the final carrying-value cent over three foreign instalments', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const tiny = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-11-10', currency: 'USD', taxInclusive: false, taxRate: '0', items: [{ description: 'Small foreign invoice', quantity: '1', rate: '0.03' }] }, 201);
      const amounts: unknown[] = [];
      for (let index = 0; index < 3; index++) {
        const payment = await f.request('/api/payments', 'POST', { invoiceId: tiny.id, amount: '0.01', paymentMethod: 'bank_transfer', paymentDate: '2026-10-20', exchangeRateId: f.rate.id }, 201);
        amounts.push(payment.bookBaseAmount);
      }
      expect(amounts).toEqual(['0.02', '0.01', '0.02']);
      const report = await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-10-01&to=2026-10-31', 'GET');
      expect(report.trialBalance.rows.find(x => x.accountNumber === '1200')?.balance).toBe('0.00');
      expect(report.cashFlow.closingCash).toBe('0.06');
      expect(report.profitLoss).toMatchObject({ revenue: '0.06', expenses: '0.00', netIncome: '0.06' });
      expect(report.balanceSheet.balanced).toBe(true);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('books a receivable loss and payable gain when the reviewed rate falls', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const rates = await f.request<{ rates: Array<{ id: string; rate: string }> }>('/api/exchange-rates', 'POST', { currencyCode: 'USD', effectiveDate: '2026-10-21', rate: '1.55' }, 201);
      const rate = rates.rates.find(x => x.rate === '1.55')!;
      const invoicePayment = await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentMethod: 'bank_transfer', paymentDate: '2026-10-21', exchangeRateId: rate.id }, 201);
      await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
      const billPayment = (await f.request<BillPaymentBatchDto>(`/api/bills/${f.bill.id}/payments`, 'POST', { bankAccountId: f.bank.id, amount: '100', paymentDate: '2026-10-21', exchangeRateId: rate.id }, 201)).payments[0];
      expect(invoicePayment).toMatchObject({ baseAmount: '155.00', bookBaseAmount: '160.00', exchangeDifference: '-5.00' });
      expect(billPayment).toMatchObject({ baseAmount: '155.00', bookBaseAmount: '160.00', exchangeDifference: '-5.00' });
      const gl = await f.sql.unsafe(`SELECT j.reference_type AS type,a.account_number AS code,l.debit_amount AS debit,l.credit_amount AS credit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id JOIN accounts a ON a.id=l.account_id WHERE a.account_number IN ('4200','5200')`);
      expect(gl).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'invoice_payment', code: '5200', debit: '5.00' }), expect.objectContaining({ type: 'bill_payment', code: '4200', credit: '5.00' })]));
      const report = await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-10-01&to=2026-10-31', 'GET');
      expect(report.profitLoss.netIncome).toBe('0.00');
      expect(report.cashFlow.closingCash).toBe('0.00');
      expect(report.balanceSheet.balanced).toBe(true);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('allocates seven tiny foreign bill categories without a negative rounding line', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const lines = [];
      for (let index = 0; index < 7; index++) {
        const account = await f.request('/api/accounts', 'POST', { name: `Foreign cost ${index}`, type: 'expense', accountClass: 'expense', accountNumber: `54${index}0` }, 201);
        lines.push({ description: `Small cost ${index}`, quantity: '1', unitPrice: '0.01', taxRate: '0', accountId: account.id });
      }
      const bill = await f.request('/api/bills', 'POST', { vendorId: f.vendor.id, issueDate: '2026-10-10', dueDate: '2026-11-10', currency: 'USD', taxInclusive: false, lines }, 201);
      await f.request(`/api/bills/${bill.id}/receive`, 'POST', {});
      const gl = await f.sql.unsafe(`SELECT l.debit_amount AS debit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id JOIN accounts a ON a.id=l.account_id WHERE j.reference_type='bill' AND j.reference_id=? AND a.account_class='expense' ORDER BY l.line_order`, [bill.id]);
      expect(gl.map(row => row.debit)).toEqual(['0.02', '0.01', '0.02', '0.01', '0.02', '0.01', '0.02']);
      expect((await f.sql.unsafe(`SELECT total_amount AS total FROM journal_entries WHERE reference_type='bill' AND reference_id=?`, [bill.id]))[0]?.total).toBe('0.11');
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it.each([['4200', 'asset'], ['5200', 'liability']] as const)('rejects incompatible reserved exchange account %s without retaining a settlement', async (code, accountClass) => withTestDb(async () => {
    const f = await fixture();
    try {
      await f.request('/api/accounts', 'POST', { name: 'Existing incompatible account', type: 'custom', accountClass, accountNumber: code }, 201);
      if (code === '4200') await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentDate: '2026-10-20', paymentMethod: 'bank_transfer', exchangeRateId: f.rate.id }, 409);
      else {
        await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
        await f.request(`/api/bills/${f.bill.id}/payments`, 'POST', { bankAccountId: f.bank.id, amount: '100', paymentDate: '2026-10-20', exchangeRateId: f.rate.id }, 409);
      }
      expect((await f.sql.unsafe('SELECT count(*) AS n FROM payments'))[0]?.n).toBe(0);
      expect((await f.sql.unsafe('SELECT count(*) AS n FROM bill_payments'))[0]?.n).toBe(0);
      expect((await f.sql.unsafe(`SELECT count(*) AS n FROM journal_entries WHERE reference_type IN ('invoice_payment','bill_payment')`))[0]?.n).toBe(0);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('rejects receipt and supplier payment dates before their source documents', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentDate: '2026-10-05', paymentMethod: 'bank_transfer', exchangeRateId: f.sourceRate.id }, 400);
      await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
      await f.request(`/api/bills/${f.bill.id}/payments`, 'POST', { bankAccountId: f.bank.id, amount: '100', paymentDate: '2026-10-05', exchangeRateId: f.sourceRate.id }, 400);
      expect((await f.sql.unsafe('SELECT count(*) AS n FROM payments'))[0]?.n).toBe(0);
      expect((await f.sql.unsafe('SELECT count(*) AS n FROM bill_payments'))[0]?.n).toBe(0);
      const paid = await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentDate: '2026-10-10', paymentMethod: 'bank_transfer', exchangeRateId: f.sourceRate.id }, 201);
      expect(paid).toMatchObject({ baseAmount: '160.00', exchangeDifference: '0.00' });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('rejects future or another company reviewed settlement rates without writing payment', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentMethod: 'bank_transfer', paymentDate: '2026-10-15', exchangeRateId: f.rate.id }, 422);
      await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentMethod: 'bank_transfer', paymentDate: '2026-10-20', exchangeRateId: crypto.randomUUID() }, 422);
      expect((await f.sql.unsafe(`SELECT count(*) AS n FROM payments`))[0]?.n).toBe(0);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));
});
