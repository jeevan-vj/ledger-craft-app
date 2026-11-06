import { describe, expect, it } from 'vitest';
import type { CurrencySettingsDto, FinancialReportResponse } from '@ledgercraft/contracts';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from './settlement.test-helper';

describe('reviewed period-end foreign receivable/payable valuation', () => {
  it('revalues open AR160 to170, reverses next day, then settles cash165 with realized gain5 exactly once', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request(`/api/invoices/${f.invoice.id}`, 'PATCH', { status: 'sent' });
      const rates = await f.request<CurrencySettingsDto>('/api/exchange-rates', 'POST', { currencyCode: 'USD', effectiveDate: '2026-10-31', rate: '1.70' }, 201);
      const closingRate = rates.rates.find(x => x.effectiveDate === '2026-10-31')!;
      const input = { asOfDate: '2026-10-31', exchangeRateIds: [closingRate.id], reason: 'October accountant review' };
      const preview = await f.request<{ positions: Array<Record<string, unknown>>; unrealizedGain: string; unrealizedLoss: string }>('/api/fx-revaluations/preview', 'POST', input);
      expect(preview).toMatchObject({ unrealizedGain: '10.00', unrealizedLoss: '0.00' });
      expect(preview.positions).toEqual([expect.objectContaining({ documentType: 'invoice', documentId: f.invoice.id, foreignOutstanding: '100.00', bookBaseAmount: '160.00', revaluedBaseAmount: '170.00', exchangeDifference: '10.00' })]);
      const posted = await f.request<{ journalEntryIds: string[]; reversalJournalEntryIds: string[] }>('/api/fx-revaluations', 'POST', { ...input, reviewed: true }, 201);
      expect(posted.journalEntryIds).toHaveLength(1);
      expect(posted.reversalJournalEntryIds).toHaveLength(1);
      await f.request(`/api/exchange-rates/${closingRate.id}`, 'DELETE', undefined, 409);
      await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentMethod: 'bank_transfer', paymentDate: '2026-10-31', exchangeRateId: f.rate.id }, 409);
      const october = await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-10-01&to=2026-10-31', 'GET');
      expect(october.balanceSheet).toMatchObject({ assets: '170.00', equity: '170.00', balanced: true });
      expect(october.trialBalance.rows.find(x => x.accountNumber === '1200')?.balance).toBe('170.00');
      const firstNovember = await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-11-01&to=2026-11-01', 'GET');
      expect(firstNovember.trialBalance.rows.find(x => x.accountNumber === '1200')?.balance).toBe('160.00');
      expect((await f.request('/api/fx-revaluations', 'POST', { ...input, reviewed: true }, 201)).journalEntryIds).toEqual(posted.journalEntryIds);
      await f.request('/api/fx-revaluations', 'POST', { ...input, exchangeRateIds: [f.rate.id], reviewed: true }, 409);
      await f.request('/api/payments', 'POST', { invoiceId: f.invoice.id, amount: '100', paymentMethod: 'bank_transfer', paymentDate: '2026-11-02', exchangeRateId: f.rate.id }, 201);
      const november = await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-11-01&to=2026-11-02', 'GET');
      expect(november.cashFlow.closingCash).toBe('165.00');
      expect(november.balanceSheet).toMatchObject({ assets: '165.00', equity: '165.00', balanced: true });
      expect(november.trialBalance.rows.find(x => x.accountNumber === '1200')?.balance).toBe('0.00');
      expect(november.trialBalance.rows.find(x => x.accountNumber === '4200')?.balance).toBe('5.00');
      expect((await f.sql.unsafe(`SELECT total_amount AS total FROM journal_entries WHERE reference_type='invoice' AND reference_id=?`, [f.invoice.id]))[0]?.total).toBe('160.00');
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

  it('revalues open AP160 to170 with unrealized loss10 and rejects missing reviewed currencies', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
      const rates = await f.request<CurrencySettingsDto>('/api/exchange-rates', 'POST', { currencyCode: 'USD', effectiveDate: '2026-10-31', rate: '1.70' }, 201);
      const rate = rates.rates.find(x => x.effectiveDate === '2026-10-31')!;
      const input = { asOfDate: '2026-10-31', exchangeRateIds: [rate.id], reason: 'Review unpaid supplier USD' };
      await f.request('/api/fx-revaluations/preview', 'POST', { ...input, asOfDate: '2099-12-31' }, 422);
      await f.request('/api/fx-revaluations/preview', 'POST', { ...input, exchangeRateIds: [crypto.randomUUID()] }, 422);
      const posted = await f.request('/api/fx-revaluations', 'POST', { ...input, reviewed: true }, 201);
      expect(posted).toMatchObject({ unrealizedLoss: '10.00', unrealizedGain: '0.00' });
      const report = await f.request<FinancialReportResponse>('/api/reports/financial?from=2026-10-01&to=2026-10-31', 'GET');
      expect(report.trialBalance.rows.find(x => x.accountNumber === '2100')?.balance).toBe('170.00');
      expect(report.trialBalance.rows.find(x => x.accountNumber === '5201')?.balance).toBe('10.00');
      expect(report.balanceSheet.balanced).toBe(true);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));
  it('isolates reviewed rates and replays the company valuation when another authorized accountant retries', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request(`/api/invoices/${f.invoice.id}`, 'PATCH', { status: 'sent' });
      const input = { asOfDate: '2026-10-31', exchangeRateIds: [f.rate.id], reason: 'Shared accountant closing review', reviewed: true };
      const initial = await f.request<{ journalEntryIds: string[] }>('/api/fx-revaluations', 'POST', input, 201);
      const email = `other-${crypto.randomUUID()}@example.test`;
      const signup = await f.app.request('/api/auth/sign-up/email', { method: 'POST', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Other accountant', email, password: 'Local-password123' }) });
      expect(signup.status).toBe(200);
      const cookie = signup.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
      const actorHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json', Cookie: cookie };
      const unauthenticated = await f.app.request('/api/fx-revaluations/preview', { method: 'POST', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, body: JSON.stringify({ asOfDate: input.asOfDate, exchangeRateIds: input.exchangeRateIds, reason: input.reason }) });
      expect(unauthenticated.status).toBe(401);
      const foreign = await f.app.request('/api/fx-revaluations/preview', { method: 'POST', headers: actorHeaders, body: JSON.stringify({ asOfDate: input.asOfDate, exchangeRateIds: input.exchangeRateIds, reason: input.reason }) });
      expect(foreign.status).toBe(422);
      const owner = await f.request<{ organisation: { id: string } }>('/api/me', 'GET');
      const invite = await f.request<{ acceptToken: string }>(`/api/organisations/${owner.organisation.id}/invitations`, 'POST', { email, role: 'accountant' }, 201);
      const accepted = await f.app.request('/api/invitations/accept', { method: 'POST', headers: actorHeaders, body: JSON.stringify({ token: invite.acceptToken }) });
      expect(accepted.status).toBe(200);
      const retried = await f.app.request('/api/fx-revaluations', { method: 'POST', headers: actorHeaders, body: JSON.stringify(input) });
      expect(retried.status).toBe(201);
      expect(await retried.json()).toMatchObject({ journalEntryIds: initial.journalEntryIds, replayed: true });
      expect((await f.sql.unsafe(`SELECT count(*) AS n FROM journal_entries WHERE reference_type='fx_revaluation'`))[0]?.n).toBe(1);
    } finally { await f.sql.end({ timeout: 5 }); }
  }));

});
