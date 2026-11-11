import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createApp } from '../../app';
import { createAuth } from '../auth/auth';
import type { CreateTaxReturnRequest, GstPreparationResponse, TaxReturnDto } from '@ledgercraft/contracts';
import { organisationMemberships } from '../../db/schema/identity';
import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
async function registered(basis: 'invoice' | 'payments' | 'hybrid' = 'invoice') {
  const { db, sql } = createDb(getDatabaseUrl());
  const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'GST working paper', email: `${crypto.randomUUID()}@example.test`, password: 'Local-GST-password123!' }) });
  const headers = { ...origin, Cookie: signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
  const request = async <T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, expected = 200) => {
    const response = await app.request(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = response.status === 204 ? null : await response.json();
    expect(response.status, JSON.stringify(value)).toBe(expected);
    return value as T;
  };
  await request('/api/business-profile', 'PUT', { name: 'Kauri GST Limited', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15' });
  const settings = { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: basis, gstFilingFrequency: 'monthly', gstPeriodAnchor: 3 };
  await request('/api/tax/gst-settings', 'PUT', settings);
  return { db, sql, app, request, settings };
}
async function books(f: Awaited<ReturnType<typeof registered>>) {
  const customer = await f.request('/api/customers', 'POST', { name: 'Harbour cafe', email: 'buyer@example.test' }, 201);
  const invoice = await f.request('/api/invoices', 'POST', { customerId: customer.id, date: '2026-04-05', dueDate: '2026-04-30', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Consulting', quantity: '1', rate: '1000' }] }, 201);
  await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
  await f.request('/api/payments', 'POST', { invoiceId: invoice.id, amount: '575', paymentDate: '2026-04-20', paymentMethod: 'bank_transfer' }, 201);
  await f.request('/api/expenses', 'POST', { description: 'GST-bearing cost', amount: '230', taxAmount: '30', gstTreatment: 'standard', currency: 'NZD', status: 'approved', expenseDate: '2026-04-12' }, 201);
  const bank = await f.request('/api/bank-accounts', 'POST', { accountName: 'Operating', accountNumber: '12-3456-000001-00', bankName: 'Test', accountType: 'checking', currency: 'NZD' }, 201);
  const vendor = await f.request('/api/vendors', 'POST', { name: 'Subcontractor' }, 201);
  const account = await f.request('/api/accounts', 'POST', { name: 'Subcontracting', type: 'expense', accountClass: 'expense', accountNumber: '5300' }, 201);
  const bill = await f.request('/api/bills', 'POST', { vendorId: vendor.id, issueDate: '2026-04-12', dueDate: '2026-04-30', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Services', quantity: '1', unitPrice: '345', taxRate: '15', accountId: account.id }] }, 201);
  await f.request(`/api/bills/${bill.id}/receive`, 'POST', {});
  await f.request(`/api/bills/${bill.id}/payments`, 'POST', { bankAccountId: bank.id, amount: '69', paymentDate: '2026-04-21' }, 201);
  return { invoice, bill };
}
function draft(preparation: GstPreparationResponse): CreateTaxReturnRequest {
  return { periodStart: preparation.from, periodEnd: preparation.to, returnType: 'GST', totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases, gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition,
    returnData: { preparation: { basis: preparation.basis, baseCurrency: 'NZD', calculationFingerprint: preparation.calculation!.fingerprint }, ...(preparation.review ? { gstReview: preparation.review } : {}) } };
}
const url = '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30';

describe('authoritative saved GST calculation', () => {
  it('refuses a GST return assembled from client totals without reviewed registered settings', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request('/api/tax-returns', 'POST', {
        periodStart: '2026-04-01', periodEnd: '2026-04-30', returnType: 'GST',
        totalSales: '9999.00', totalPurchases: '0.00', gstOnSales: '1304.22', gstOnPurchases: '0.00', netGst: '1304.22',
      }, 422);
      expect(await f.request('/api/tax-returns', 'GET')).toMatchObject({ taxReturns: [] });
    } finally { await f.sql.end(); }
  }));

  it.each([['invoice', '75.00', '1150.00', '575.00'], ['payments', '36.00', '575.00', '299.00'], ['hybrid', '111.00', '1150.00', '299.00']] as const)('uses registered %s basis and stores exact source/version/myIR evidence', async (basis, net, sales, purchases) => withTestDb(async () => {
    const f = await registered(basis);
    try {
      const source = await books(f);
      const preparation = await f.request<GstPreparationResponse>(url);
      expect(preparation).toMatchObject({ basis, totalSales: sales, totalPurchases: purchases, netGstPosition: net, calculation: { version: 'gst-ledger-v3', settings: { gstAccountingBasis: basis }, myIrBoxes: { '5': sales, '11': purchases, '15': net }, mappingStatus: 'supported' } });
      expect(preparation.calculation!.sourceIds.invoices).toContain(source.invoice.id);
      expect(preparation.calculation!.sourceIds.bills).toContain(source.bill.id);
      expect(preparation.calculation!.sourceCounts.journalLines).toBeGreaterThan(0);
      const again = await f.request<GstPreparationResponse>(url);
      expect(again.calculation!.fingerprint).toBe(preparation.calculation!.fingerprint);
      const saved = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(preparation), 201);
      expect(saved.returnData?.gstCalculation).toMatchObject({ fingerprint: preparation.calculation!.fingerprint, settings: { gstAccountingBasis: basis }, myIrBoxes: { '15': net } });
      if (process.env.ISSUE_115_GST_EVIDENCE_DIRECTORY) {
        await mkdir(process.env.ISSUE_115_GST_EVIDENCE_DIRECTORY, { recursive: true });
        await writeFile(join(process.env.ISSUE_115_GST_EVIDENCE_DIRECTORY, `${basis}.json`), JSON.stringify({ expected: { sales, purchases, net }, preparation, saved }, null, 2));
      }
      expect((await f.request<TaxReturnDto>(`/api/tax-returns/${saved.id}`)).returnData).toEqual(saved.returnData);
      await f.request('/api/tax-returns', 'POST', { ...draft(preparation), netGst: '999.00' }, 422);
      await f.request('/api/tax-returns', 'POST', { ...draft(preparation), returnData: { ...draft(preparation).returnData, gstCalculation: { ...preparation.calculation!, myIrBoxes: { ...preparation.calculation!.myIrBoxes, '15': '999.00' } } } }, 422);
    } finally { await f.sql.end(); }
  }));

  it('rejects a source dated inside a filed period and keeps the filed source snapshot unchanged', async () => withTestDb(async () => {
    const f = await registered();
    try {
      await books(f);
      const preparation = await f.request<GstPreparationResponse>(url);
      const saved = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(preparation), 201);
      const filed = await f.request<TaxReturnDto>(`/api/tax-returns/${saved.id}/file`, 'POST', { irdReference: 'TEST-MYIR-GST-001' });
      const late = await f.request<{ error: { code: string } }>('/api/expenses', 'POST', { description: 'Late entered supported receipt', amount: '115', taxAmount: '15', gstTreatment: 'standard', status: 'approved', currency: 'NZD', expenseDate: '2026-04-22' }, 409);
      expect(late.error.code).toBe('GST_PERIOD_FILED');
      await f.request('/api/tax-returns', 'POST', draft(preparation), 409);
      const compared = await f.request<{ recorded: TaxReturnDto; current: GstPreparationResponse; difference: { netGst: string }; settingsChanged: boolean }>(`/api/tax-returns/${saved.id}/recalculation`);
      expect(compared).toMatchObject({ recorded: { status: 'submitted', netGst: '75.00' }, current: { netGstPosition: '75.00' }, difference: { netGst: '0.00' }, settingsChanged: false });
      expect(compared.recorded).toEqual(filed);
      expect(await f.request(`/api/tax-returns/${saved.id}`)).toEqual(filed);
      await f.request(`/api/tax-returns/${saved.id}`, 'PATCH', { netGst: '60.00' }, 409);
      const other = await f.app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'Other owner', email: `${crypto.randomUUID()}@example.test`, password: 'Local-other-owner123!' }) });
      expect((await f.app.request(`/api/tax-returns/${saved.id}/recalculation`, { headers: { ...origin, Cookie: other.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') } })).status).toBe(404);
    } finally { await f.sql.end(); }
  }));

  it('retains original basis/settings in recalculation after current registration basis changes', async () => withTestDb(async () => {
    const f = await registered();
    try {
      await books(f);
      const preparation = await f.request<GstPreparationResponse>(url);
      const saved = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(preparation), 201);
      await f.request('/api/tax/gst-settings', 'PUT', { ...f.settings, gstAccountingBasis: 'payments' });
      await f.request(`/api/tax-returns/${saved.id}`, 'PATCH', draft(preparation), 409);
      const compared = await f.request<{ recorded: TaxReturnDto; current: GstPreparationResponse; difference: { netGst: string }; settingsChanged: boolean }>(`/api/tax-returns/${saved.id}/recalculation`);
      expect(compared).toMatchObject({ current: { basis: 'invoice', netGstPosition: '75.00' }, difference: { netGst: '0.00' }, settingsChanged: true });
      expect(compared.recorded).toEqual(saved);
    } finally { await f.sql.end(); }
  }));

  it('preserves saved draft snapshots, allows a new revision and blocks duplicate filed periods', async () => withTestDb(async () => {
    const f = await registered();
    try {
      await books(f);
      const preparation = await f.request<GstPreparationResponse>(url);
      const saved = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(preparation), 201);
      expect(await f.request(`/api/tax-returns/${saved.id}`, 'PATCH', { netGst: '75.00' })).toEqual(saved);
      await f.request(`/api/tax-returns/${saved.id}`, 'DELETE', undefined, 409);
      await f.request('/api/expenses', 'POST', { description: 'Additional source receipt', amount: '115', taxAmount: '15', gstTreatment: 'standard', status: 'approved', currency: 'NZD', expenseDate: '2026-04-22' }, 201);
      const revised = await f.request<GstPreparationResponse>(url);
      await f.request(`/api/tax-returns/${saved.id}`, 'PATCH', draft(revised), 409);
      expect(await f.request(`/api/tax-returns/${saved.id}`)).toEqual(saved);
      const newDraft = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(revised), 201);
      const secondDraft = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(revised), 201);
      await f.request(`/api/tax-returns/${newDraft.id}/file`, 'POST', { irdReference: 'TEST-MYIR-REVISION' });
      await f.request(`/api/tax-returns/${secondDraft.id}/file`, 'POST', { irdReference: 'TEST-MYIR-DUPLICATE' }, 409);
      await f.request('/api/tax-returns', 'POST', draft(revised), 409);
    } finally { await f.sql.end(); }
  }));

  it('does not record a future taxable period as already filed', async () => withTestDb(async () => {
    const f = await registered();
    try {
      const year = new Date().getUTCFullYear() + 2;
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?from=${year}-04-01&to=${year}-04-30`);
      const saved = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(preparation), 201);
      await f.request(`/api/tax-returns/${saved.id}/file`, 'POST', { irdReference: 'TEST-FUTURE-INVALID' }, 422);
      expect(await f.request(`/api/tax-returns/${saved.id}`)).toMatchObject({ status: 'draft', irdReference: null });
    } finally { await f.sql.end(); }
  }));

  it('returns a read-only comparison requiring fresh classification when original zero-rated review is stale', async () => withTestDb(async () => {
    const f = await registered();
    try {
      await books(f);
      const customer = await f.request('/api/customers', 'POST', { name: 'Export client', email: 'export@example.test' }, 201);
      const sale = async (rate: string) => {
        const invoice = await f.request('/api/invoices', 'POST', { customerId: customer.id, date: '2026-04-11', dueDate: '2026-04-30', currency: 'NZD', taxInclusive: false, taxRate: '0', items: [{ description: 'Source-reviewed zero-rated export', quantity: '1', rate }] }, 201);
        await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
      };
      await sale('500');
      const reviewed = await f.request<GstPreparationResponse>('/api/tax/gst-preparation', 'POST', { from: '2026-04-01', to: '2026-04-30', reviewConfirmed: true, adjustments: [], salesClassificationReview: { zeroRatedSales: '500.00', exemptSales: '0.00', reason: 'Reviewed eligible export source documents', sourceReference: 'EXPORT-001' } });
      const saved = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(reviewed), 201);
      await sale('250');
      const compared = await f.request<{ recorded: TaxReturnDto; current: GstPreparationResponse }>(`/api/tax-returns/${saved.id}/recalculation`);
      expect(compared.recorded).toEqual(saved);
      expect(compared.current).toMatchObject({ netGstPosition: '75.00', requiresReview: true, calculation: { mappingStatus: 'requires_confirmation' } });
      expect(compared.current.calculation?.myIrBoxes['8']).toBeUndefined();
      expect(compared.current.calculation?.myIrBoxes['9']).toBeUndefined();
      expect(compared.current.warnings.join(' ')).toMatch(/classification.*no longer|classification.*changed/i);
    } finally { await f.sql.end(); }
  }));

  it('enforces real HTTP member/read-only GST write restrictions while preserving read access', async () => withTestDb(async () => {
    const f = await registered();
    try {
      await books(f);
      const preparation = await f.request<GstPreparationResponse>(url);
      const saved = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(preparation), 201);
      const [membership] = await f.db.select().from(organisationMemberships);
      for (const role of ['member', 'read_only']) {
        await f.db.update(organisationMemberships).set({ role }).where(eq(organisationMemberships.id, membership.id));
        await f.request('/api/tax/gst-settings');
        await f.request(url);
        await f.request(`/api/tax-returns/${saved.id}/recalculation`);
        await f.request('/api/tax/gst-settings', 'PUT', f.settings, 403);
        await f.request('/api/tax-returns', 'POST', draft(preparation), 403);
        await f.request(`/api/tax-returns/${saved.id}`, 'PATCH', { netGst: '75.00' }, 403);
        await f.request(`/api/tax-returns/${saved.id}/file`, 'POST', { irdReference: 'TEST-UNAUTHORISED' }, 403);
      }
      expect(await f.request(`/api/tax-returns/${saved.id}`)).toEqual(saved);
    } finally { await f.sql.end(); }
  }));
});
