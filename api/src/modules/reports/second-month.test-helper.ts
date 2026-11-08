import { expect } from 'vitest';
import type { FinancialReportResponse, GstPreparationResponse } from '@ledgercraft/contracts';
import { fullMonthCloseFixture } from './full-month-close.test-helper';

type Source = { id: string; type: 'payment' | 'bill_payment' | 'expense' | 'credit_refund' };
type Movement = { date: string; amount: string; type: 'credit' | 'debit'; source: Source };
export const periodPath = (from: string, to: string, extra = '') => `/api/reports/financial?from=${from}&to=${to}&basis=accrual&baseCurrency=NZD${extra}`;
export const reportSections = (report: FinancialReportResponse) => ({ ...report, meta: undefined });

export async function secondMonthFixture() {
  const f = await fullMonthCloseFixture();
  await f.request('/api/currency-settings', 'PATCH', { financialYearStartMonth: 4, financialYearStartDay: 1 });
  async function reconcile(from: string, to: string, opening: string, closing: string, movements: Movement[]) {
    const imported = await f.post<{ transactions: Array<{ id: string }> }>('/api/bank-transactions/import', { bankAccountId: f.bank.id, transactions: movements.map((row, index) => ({ transactionDate: row.date, amount: row.amount, type: row.type, description: `Reviewed ${from} statement line ${index + 1}` })) });
    const session = await f.post('/api/reconciliation-sessions', { bankAccountId: f.bank.id, statementStartDate: from, statementEndDate: to, statementOpeningBalance: opening, statementClosingBalance: closing });
    for (const [index, movement] of movements.entries()) await f.post(`/api/reconciliation-sessions/${session.id}/matches`, { bankTransactionId: imported.transactions[index].id, bookItemType: movement.source.type, bookItemId: movement.source.id, status: 'confirmed' });
    const completed = await f.post(`/api/reconciliation-sessions/${session.id}/complete`, {}, 200);
    expect(completed).toMatchObject({ status: 'completed', bookOpeningBalance: opening, bookClosingBalance: closing, difference: '0.00', matchedCount: movements.length });
    return { session, completed, imported };
  }
  const books = await f.request<{ entries: Array<{ id: string; type: string }> }>('/api/book-entries?from=2026-10-01&to=2026-10-31');
  const refund = books.entries.find(row => row.type === 'credit_refund')!;
  const octoberBank = await reconcile('2026-10-01', '2026-10-31', '10000.00', '11380.00', [
    { date: '2026-10-05', amount: '1150', type: 'credit', source: { type: 'payment', id: f.receipts[0].id } },
    { date: '2026-10-06', amount: '1150', type: 'credit', source: { type: 'payment', id: f.receipts[1].id } },
    { date: '2026-10-08', amount: '575', type: 'debit', source: { type: 'bill_payment', id: f.supplier.id } },
    { date: '2026-10-09', amount: '230', type: 'debit', source: { type: 'expense', id: f.expense.id } },
    { date: '2026-10-12', amount: '115', type: 'debit', source: { type: 'credit_refund', id: refund.id } },
  ]);
  const october = await f.request<FinancialReportResponse>(periodPath('2026-10-01', '2026-10-31'));
  const octoberGst = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-10-01&to=2026-10-31');
  await f.post('/api/accounting-periods/close', { through: '2026-10-31', reason: 'Reviewed October opening, journals, bank and GST', reviewed: true, expectedRevision: 0 }, 200);
  const octoberJournals = await f.request<{ journalEntries: Array<{ id: string }> }>('/api/journal-entries');
  const lateReceipt = await f.post('/api/payments', { invoiceId: f.invoices[0].id, amount: '920', paymentDate: '2026-11-02', paymentMethod: 'bank_transfer' });
  const oldBillPayment = await f.post<{ payments: Array<{ id: string }> }>(`/api/bills/${f.bill.id}/payments`, { bankAccountId: f.bank.id, amount: '575', paymentDate: '2026-11-03' });
  const customer = await f.post('/api/customers', { name: 'November service customer', email: 'november@example.test' });
  const invoice = await f.post('/api/invoices', { customerId: customer.id, date: '2026-11-04', dueDate: '2026-11-30', taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: 'November services', quantity: '1', rate: '1000' }] });
  await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
  const beforeOverpayment = await f.request('/api/journal-entries');
  const paymentsBeforeOverpayment = await f.request('/api/payments');
  const overpayment = await f.post<{ error: { code: string } }>('/api/payments', { invoiceId: invoice.id, amount: '1150.01', paymentDate: '2026-11-05', paymentMethod: 'bank_transfer' }, 400);
  expect(overpayment.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
  expect(await f.request('/api/journal-entries')).toEqual(beforeOverpayment);
  expect(await f.request('/api/payments')).toEqual(paymentsBeforeOverpayment);
  const receiptBody = { invoiceId: invoice.id, amount: '575', paymentDate: '2026-11-05', paymentMethod: 'bank_transfer' };
  const receipt = await f.post('/api/payments', receiptBody, 201, 'november-lost-response-receipt');
  const journalsAfterReceipt = await f.request('/api/journal-entries');
  const recoveredReceipt = await f.post('/api/payments', receiptBody, 201, 'november-lost-response-receipt');
  expect(recoveredReceipt).toEqual(receipt);
  expect(await f.request('/api/journal-entries')).toEqual(journalsAfterReceipt);
  const changedRetry = await f.post<{ error: { code: string } }>('/api/payments', { ...receiptBody, amount: '575.01' }, 409, 'november-lost-response-receipt');
  expect(changedRetry.error.code).toBe('IDEMPOTENCY_CONFLICT');
  const credit = await f.post('/api/credit-notes', { invoiceId: invoice.id, issueDate: '2026-11-06', reason: 'November service reduction after reviewed receipt', taxInclusive: false, taxRate: '15', items: [{ description: 'Service reduction', quantity: '1', rate: '100' }] });
  const vendor = await f.post('/api/vendors', { name: 'November supplier' });
  const bill = await f.post('/api/bills', { vendorId: vendor.id, issueDate: '2026-11-07', dueDate: '2026-11-30', taxInclusive: false, currency: 'NZD', lines: [{ description: 'November subcontracting', quantity: '1', unitPrice: '400', taxRate: '15', accountId: f.cost.id }] });
  await f.post(`/api/bills/${bill.id}/receive`, {}, 200);
  const billPayment = await f.post<{ payments: Array<{ id: string }> }>(`/api/bills/${bill.id}/payments`, { bankAccountId: f.bank.id, amount: '230', paymentDate: '2026-11-08' });
  const expense = await f.post('/api/expenses', { description: 'November software cost', amount: '115', taxAmount: '15', gstTreatment: 'standard', currency: 'NZD', expenseDate: '2026-11-08', status: 'approved', accountId: f.cash.id });
  const novemberBank = await reconcile('2026-11-01', '2026-11-30', '11380.00', '11955.00', [
    { date: '2026-11-02', amount: '920', type: 'credit', source: { type: 'payment', id: lateReceipt.id } },
    { date: '2026-11-03', amount: '575', type: 'debit', source: { type: 'bill_payment', id: oldBillPayment.payments[0].id } },
    { date: '2026-11-05', amount: '575', type: 'credit', source: { type: 'payment', id: receipt.id } },
    { date: '2026-11-08', amount: '230', type: 'debit', source: { type: 'bill_payment', id: billPayment.payments[0].id } },
    { date: '2026-11-08', amount: '115', type: 'debit', source: { type: 'expense', id: expense.id } },
  ]);
  return { ...f, reconcile, october, octoberGst, octoberJournals, octoberBank, novemberBank, november: { customer, invoice, receipt, credit, vendor, bill, billPayment, expense }, overpayment, recoveredReceipt };
}
