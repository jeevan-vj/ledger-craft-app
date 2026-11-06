import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CurrencySettingsDto, FinancialReportResponse } from '@ledgercraft/contracts';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';

const reportPath = (to: string) => `/api/reports/financial?from=2026-10-01&to=${to}&basis=accrual&baseCurrency=NZD`;
async function evidence(name: string, value: unknown) {
  const directory = process.env.ACCOUNTING_EVIDENCE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n');
}
describe('historical base-currency receivables and payables ageing', () => {
  it('retains foreign AR/AP170 at reviewed closing,160 after reversal, and0 after later settlement without rewriting prior ageing', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request(`/api/invoices/${f.invoice.id}`, 'PATCH', { status: 'sent' });
      await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
      const rates = await f.request<CurrencySettingsDto>('/api/exchange-rates', 'POST', { currencyCode: 'USD', effectiveDate: '2026-10-31', rate: '1.70' }, 201);
      const rate = rates.rates.find((row) => row.effectiveDate === '2026-10-31')!;
      await f.request('/api/fx-revaluations', 'POST', { asOfDate: '2026-10-31', exchangeRateIds: [rate.id], reason: 'Reviewed historical AR and AP closing', reviewed: true }, 201);
      const october = await f.request<FinancialReportResponse>(reportPath('2026-10-31'), 'GET');
      expect(october.receivablesAging.total).toBe('170.00');
      expect(october.payablesAging.total).toBe('170.00');
      expect(october.receivablesAging.items[0]).toMatchObject({ id: f.invoice.id, balanceDue: '170.00' });
      expect(october.payablesAging.items[0]).toMatchObject({ id: f.bill.id, balanceDue: '170.00' });
      const payment = await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentDate: '2026-11-02', paymentMethod: 'bank_transfer', exchangeRateId: f.rate.id }, 201);
      await f.request(`/api/bills/${f.bill.id}/payments`, 'POST', { bankAccountId: f.bank.id, amount: '100', paymentDate: '2026-11-02', exchangeRateId: f.rate.id }, 201);
      const octoberAfter = await f.request<FinancialReportResponse>(reportPath('2026-10-31'), 'GET');
      expect(octoberAfter.receivablesAging).toEqual(october.receivablesAging);
      expect(octoberAfter.payablesAging).toEqual(october.payablesAging);
      const nextDay = await f.request<FinancialReportResponse>(reportPath('2026-11-01'), 'GET');
      expect(nextDay.receivablesAging.total).toBe('160.00'); expect(nextDay.payablesAging.total).toBe('160.00');
      const settled = await f.request<FinancialReportResponse>(reportPath('2026-11-02'), 'GET');
      expect(settled.receivablesAging.total).toBe('0.00'); expect(settled.payablesAging.total).toBe('0.00');
      await f.request(`/api/payments/${payment.id}/reverse`, 'POST', { reason: 'Receipt reversed after closing', reversalDate: '2026-11-03' });
      expect((await f.request<FinancialReportResponse>(reportPath('2026-11-02'), 'GET')).receivablesAging.total).toBe('0.00');
      expect((await f.request<FinancialReportResponse>(reportPath('2026-11-03'), 'GET')).receivablesAging.total).toBe('160.00');
      await evidence('historical-fx-aging.json', { expected: { october: { receivables: '170.00', payables: '170.00' }, nextDay: { receivables: '160.00', payables: '160.00' }, settled: { receivables: '0.00', payables: '0.00' } }, actual: { october: octoberAfter, nextDay, settled }, laterReceiptDoesNotChangeOctober: true });
    } finally { await f.sql.end(); }
  }));
  it('keeps NZD invoice1150 in October ageing after its November receipt', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const invoice = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-10-30', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'NZD advisory', quantity: '1', rate: '1000' }] }, 201);
      await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      await f.request('/api/payments', 'POST', { invoiceId: invoice.id, amount: '1150', paymentDate: '2026-11-02', paymentMethod: 'bank_transfer' }, 201);
      const october = await f.request<FinancialReportResponse>(reportPath('2026-10-31'), 'GET');
      expect(october.receivablesAging.total).toBe('1150.00');
      expect(october.receivablesAging.days1To30).toBe('1150.00');
      expect(october.salesSummary).toMatchObject({ total: '1150.00', paid: '0.00', outstanding: '1150.00' });
      const november = await f.request<FinancialReportResponse>(reportPath('2026-11-02'), 'GET');
      expect(november.receivablesAging.total).toBe('0.00');
      expect(november.salesSummary).toMatchObject({ total: '1150.00', paid: '1150.00', outstanding: '0.00' });
    } finally { await f.sql.end(); }
  }));
  it('uses dated cancellation and restoration journals instead of current document status', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request(`/api/invoices/${f.invoice.id}`, 'PATCH', { status: 'sent' });
      await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-02T00:00:00Z') });
      await f.request(`/api/invoices/${f.invoice.id}/cancel`, 'POST', {});
      await f.request(`/api/bills/${f.bill.id}/cancel`, 'POST', {});
      const october = await f.request<FinancialReportResponse>(reportPath('2026-10-31'), 'GET');
      expect(october.receivablesAging.total).toBe('160.00'); expect(october.payablesAging.total).toBe('160.00');
      vi.setSystemTime(new Date('2026-11-04T00:00:00Z'));
      await f.request(`/api/invoices/${f.invoice.id}/restore`, 'POST', {});
      await f.request(`/api/bills/${f.bill.id}/restore`, 'POST', {});
      const canceled = await f.request<FinancialReportResponse>(reportPath('2026-11-03'), 'GET');
      expect(canceled.receivablesAging.total).toBe('0.00'); expect(canceled.payablesAging.total).toBe('0.00');
      const restored = await f.request<FinancialReportResponse>(reportPath('2026-11-05'), 'GET');
      expect(restored.receivablesAging.total).toBe('160.00'); expect(restored.payablesAging.total).toBe('160.00');
    } finally { vi.useRealTimers(); await f.sql.end(); }
  }));
  it('includes dated credit-note receivable movements and their reversals without rewriting older ageing', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request(`/api/invoices/${f.invoice.id}`, 'PATCH', { status: 'sent' });
      const created = await f.app.request('/api/credit-notes', { method: 'POST', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json', Cookie: f.cookie, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ invoiceId: f.invoice.id, issueDate: '2026-10-20', reason: 'Reviewed partial credit', taxInclusive: false, taxRate: '0', items: [{ description: 'Returned consulting', quantity: '1', rate: '25' }] }) });
      expect(created.status).toBe(201);
      const credit = await created.json() as { id: string };
      expect((await f.request<FinancialReportResponse>(reportPath('2026-10-15'), 'GET')).receivablesAging.total).toBe('160.00');
      expect((await f.request<FinancialReportResponse>(reportPath('2026-10-31'), 'GET')).receivablesAging.total).toBe('120.00');
      await f.request(`/api/credit-notes/${credit.id}/reverse`, 'POST', { date: '2026-11-02', reason: 'Correct the credit on original source' });
      expect((await f.request<FinancialReportResponse>(reportPath('2026-10-31'), 'GET')).receivablesAging.total).toBe('120.00');
      expect((await f.request<FinancialReportResponse>(reportPath('2026-11-03'), 'GET')).receivablesAging.total).toBe('160.00');
    } finally { await f.sql.end(); }
  }));
  it('preserves per-document allocation across a two-invoice bank acceptance and its later undo', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const other = await f.request('/api/customers', 'POST', { name: 'Second NZD customer', email: 'second@example.test' }, 201);
      const first = await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-10', dueDate: '2026-10-30', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'First NZD advice', quantity: '1', rate: '100' }] }, 201);
      const second = await f.request('/api/invoices', 'POST', { customerId: other.id, date: '2026-10-10', dueDate: '2026-10-30', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Second NZD advice', quantity: '1', rate: '200' }] }, 201);
      for (const invoice of [first, second]) await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      const bank = await f.request('/api/bank-transactions', 'POST', { bankAccountId: f.bank.id, transactionDate: '2026-10-20', description: 'Combined customer receipts', amount: '345', type: 'credit' }, 201);
      await f.request(`/api/bank-transactions/${bank.id}/accept`, 'POST', { allocations: [{ documentType: 'invoice', documentId: first.id, amount: '115' }, { documentType: 'invoice', documentId: second.id, amount: '230' }] }, 201);
      expect((await f.request<FinancialReportResponse>(reportPath('2026-10-19'), 'GET')).receivablesAging.total).toBe('345.00');
      expect((await f.request<FinancialReportResponse>(reportPath('2026-10-31'), 'GET')).receivablesAging.total).toBe('0.00');
      await f.request(`/api/bank-transactions/${bank.id}/undo`, 'POST', { reversalDate: '2026-11-01', reason: 'Undo combined statement allocation' });
      expect((await f.request<FinancialReportResponse>(reportPath('2026-10-31'), 'GET')).receivablesAging.total).toBe('0.00');
      const restored = await f.request<FinancialReportResponse>(reportPath('2026-11-01'), 'GET');
      expect(restored.receivablesAging.total).toBe('345.00');
      expect(restored.receivablesAging.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.id, balanceDue: '115.00' }), expect.objectContaining({ id: second.id, balanceDue: '230.00' })]));
      const scoped = await f.request<FinancialReportResponse>(`${reportPath('2026-11-01')}&customerIds=${other.id}`, 'GET');
      expect(scoped.receivablesAging.total).toBe('230.00');
      expect(scoped.receivablesAging.items).toHaveLength(1);
    } finally { await f.sql.end(); }
  }));

});
