import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { GstPeriodCorrection, GstPreparationResponse, TaxReturnDto } from '@ledgercraft/contracts';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { organisationMemberships } from '../../db/schema/identity';
import { invoices } from '../../db/schema/invoices';
import { gstCorrectionEvents, gstPeriodCorrections } from '../../db/schema/tax';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { gstCorrectionCarryLimit } from './gst-correction-limit';

const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
type Basis = 'invoice' | 'payments' | 'hybrid';

async function org(basis: Basis, registeredFrom = '2026-07-01') {
  const { db, sql } = createDb(getDatabaseUrl());
  const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'GST correction owner', email: `${crypto.randomUUID()}@example.test`, password: 'Local-GST-correction-2026!' }) });
  const headers = { ...origin, Cookie: signup.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ') };
  const request = async <T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, expected = 200, extra?: Record<string, string>) => {
    const response = await app.request(path, { method, headers: { ...headers, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = response.status === 204 ? null : await response.json();
    expect(response.status, `${method} ${path} ${JSON.stringify(value)}`).toBe(expected);
    return value as T;
  };
  await request('/api/business-profile', 'PUT', { name: 'Kauri GST Limited', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15' });
  await request('/api/tax/gst-settings', 'PUT', { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: registeredFrom, gstAccountingBasis: basis, gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 10 });
  await request('/api/accounts/initialize', 'POST', {});
  const customer = await request<{ id: string }>('/api/customers', 'POST', { name: 'Harbour cafe', email: 'buyer@example.test' }, 201);
  const bank = await request<{ id: string }>('/api/bank-accounts', 'POST', { accountName: 'Operating', accountNumber: '12-3456-000001-00', bankName: 'Test', accountType: 'checking', currency: 'NZD' }, 201);
  return { db, sql, app, request, customer, bank, headers };
}

async function filePeriod(f: Awaited<ReturnType<typeof org>>, from: string, to: string, reference: string) {
  const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?from=${from}&to=${to}`);
  expect(preparation.calculation?.mappingStatus).toBe('supported');
  const draft = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', {
    periodStart: from, periodEnd: to, returnType: 'GST',
    totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases,
    gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition,
    returnData: { preparation: { basis: preparation.basis, baseCurrency: 'NZD', calculationFingerprint: preparation.calculation!.fingerprint } },
  }, 201);
  return f.request<TaxReturnDto>(`/api/tax-returns/${draft.id}/file`, 'POST', { irdReference: reference });
}

function correctionBody(sourceId: string, amount: string, original = { originalPeriodStart: '2026-07-01', originalPeriodEnd: '2026-08-31' }, sourceType: 'invoice' | 'payment' = 'invoice') {
  return {
    ...original, sourceType, sourceId, action: 'changed' as const, kind: 'output' as const, amount,
    reason: 'Filed period understated the output GST on this transaction',
  };
}

describe('prior period GST corrections', () => {
  it.each(['invoice', 'payments', 'hybrid'] as const)('carries a 40.00 correction for %s basis into the next period without changing the filed snapshot', async (basis) => withTestDb(async () => {
    const f = await org(basis);
    try {
      const sale = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-07-15', dueDate: '2026-08-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'July consulting', quantity: '1', rate: '100' }] }, 201);
      await f.request(`/api/invoices/${sale.id}`, 'PATCH', { status: 'sent' });
      let sourceId = sale.id;
      if (basis === 'payments') {
        const paid = await f.request<{ id: string }>('/api/payments', 'POST', { invoiceId: sale.id, amount: '115.00', paymentDate: '2026-07-20', paymentMethod: 'bank_transfer' }, 201);
        sourceId = paid.id;
      }
      const filed = await filePeriod(f, '2026-07-01', '2026-08-31', 'MYIR-JUL-AUG-2026');
      const before = structuredClone(filed.returnData);
      const created = await f.request<GstPeriodCorrection>('/api/tax/gst-corrections', 'POST', correctionBody(sourceId, '40.00', undefined, basis === 'payments' ? 'payment' : 'invoice'), 201);
      expect(created).toMatchObject({ status: 'pending', carryForward: 'included', amount: '40.00', targetPeriodStart: '2026-09-01', targetPeriodEnd: '2026-10-31', action: 'changed' });
      const retained = await f.request<TaxReturnDto>(`/api/tax-returns/${filed.id}`);
      expect(retained.returnData).toEqual(before);
      const [invoiceRow] = await f.db.select({ status: invoices.status, date: invoices.date }).from(invoices).where(eq(invoices.id, sale.id));
      expect(invoiceRow?.date).toBe('2026-07-15');
      expect(['sent', 'paid']).toContain(invoiceRow?.status);
      const next = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(next.calculation?.version).toBe('gst-ledger-v3');
      expect(next.calculation && 'myIrBoxes' in next.calculation ? next.calculation.myIrBoxes['9'] : undefined).toBe('40.00');
      expect(next.priorPeriodCorrections?.map((row) => row.id)).toEqual([created.id]);
      expect(next.calculation && next.calculation.version === 'gst-ledger-v3' ? next.calculation.priorPeriodCorrections : undefined).toEqual([
        expect.objectContaining({ id: created.id, sourceId, originalPeriodStart: '2026-07-01', amount: '40.00' }),
      ]);
      const events = await f.db.select({ action: gstCorrectionEvents.action }).from(gstCorrectionEvents).where(eq(gstCorrectionEvents.correctionId, created.id));
      expect(events.map((row) => row.action)).toEqual(['recorded']);
    } finally { await f.sql.end(); }
  }));

  it('allows exactly $1,000, refuses one cent more, and blocks filing until the original return is amended in myIR', async () => withTestDb(async () => {
    const f = await org('invoice');
    try {
      const sale = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-07-15', dueDate: '2026-08-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'July consulting', quantity: '1', rate: '100.10' }] }, 201);
      await f.request(`/api/invoices/${sale.id}`, 'PATCH', { status: 'sent' });
      await filePeriod(f, '2026-07-01', '2026-08-31', 'MYIR-JUL-AUG-2026');
      const september = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-09-15', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'September consulting', quantity: '1', rate: '100.10' }] }, 201);
      await f.request(`/api/invoices/${september.id}`, 'PATCH', { status: 'sent' });
      const openBefore = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(gstCorrectionCarryLimit(openBefore.gstOnSales)).toBe('1000.00');
      const allowed = await f.request<GstPeriodCorrection>('/api/tax/gst-corrections', 'POST', correctionBody(sale.id, '1000.00'), 201);
      expect(allowed).toMatchObject({ status: 'pending', carryForward: 'included', limit: '1000.00', netDiscrepancy: '1000.00' });
      const refused = await f.request<{ error: { code: string; message: string } }>('/api/tax/gst-corrections', 'POST', correctionBody(sale.id, '0.01'), 422);
      expect(refused.error.code).toBe('GST_CORRECTION_OVER_LIMIT');
      expect(refused.error.message).toMatch(/myIR/);
      const blockedPrep = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(blockedPrep.calculation?.myIrBoxes['9']).toBe('1000.00');
      expect(blockedPrep.priorPeriodCorrections?.some((row) => row.status === 'over_limit')).toBe(true);
      const draft = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', {
        periodStart: '2026-09-01', periodEnd: '2026-10-31', returnType: 'GST',
        totalSales: blockedPrep.totalSales, totalPurchases: blockedPrep.totalPurchases,
        gstOnSales: blockedPrep.gstOnSales, gstOnPurchases: blockedPrep.gstOnPurchases, netGst: blockedPrep.netGstPosition,
        returnData: { preparation: { basis: blockedPrep.basis, baseCurrency: 'NZD', calculationFingerprint: blockedPrep.calculation!.fingerprint } },
      }, 201);
      const blocked = await f.request<{ error: { code: string; message: string } }>(`/api/tax-returns/${draft.id}/file`, 'POST', { irdReference: 'MYIR-SEP-OCT-2026' }, 409);
      expect(blocked.error.code).toBe('GST_CORRECTION_UNRESOLVED');
      expect(blocked.error.message).toMatch(/myIR/);
      const over = blockedPrep.priorPeriodCorrections?.find((row) => row.amount === '0.01');
      expect(over?.status).toBe('over_limit');
      await f.request(`/api/tax/gst-corrections/${over!.id}/resolve`, 'POST', { resolution: 'amend_in_myir', reason: 'The $0.01 will be amended on the original return in myIR' });
      const open = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(open.calculation?.myIrBoxes['9']).toBe('1000.00');
      const replacement = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', {
        periodStart: '2026-09-01', periodEnd: '2026-10-31', returnType: 'GST',
        totalSales: open.totalSales, totalPurchases: open.totalPurchases,
        gstOnSales: open.gstOnSales, gstOnPurchases: open.gstOnPurchases, netGst: open.netGstPosition,
        returnData: { preparation: { basis: open.basis, baseCurrency: 'NZD', calculationFingerprint: open.calculation!.fingerprint } },
      }, 201);
      const filed = await f.request<TaxReturnDto>(`/api/tax-returns/${replacement.id}/file`, 'POST', { irdReference: 'MYIR-SEP-OCT-2026' });
      expect(filed.status).toBe('submitted');
      const stored = await f.db.select({ status: gstPeriodCorrections.status, includedTaxReturnId: gstPeriodCorrections.includedTaxReturnId }).from(gstPeriodCorrections).where(eq(gstPeriodCorrections.id, allowed.id));
      expect(stored).toEqual([{ status: 'included', includedTaxReturnId: filed.id }]);
      const july = await f.request<{ taxReturns: TaxReturnDto[] }>('/api/tax-returns');
      const original = july.taxReturns.find((row) => row.periodStart === '2026-07-01');
      expect(original?.returnData?.gstCalculation && 'priorPeriodCorrections' in original.returnData.gstCalculation ? original.returnData.gstCalculation.priorPeriodCorrections : undefined).toBeUndefined();
      const outsider = await f.app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'Other GST owner', email: `${crypto.randomUUID()}@example.test`, password: 'Local-GST-correction-2026!' }) });
      const outsiderHeaders = { ...origin, Cookie: outsider.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ') };
      const cross = await f.app.request(`/api/tax/gst-corrections/${allowed.id}/resolve`, { method: 'POST', headers: outsiderHeaders, body: JSON.stringify({ resolution: 'amend_in_myir', reason: 'Other company tries to resolve it' }) });
      expect(cross.status).toBe(404);
    } finally { await f.sql.end(); }
  }));

  it('applies the lower of $10,000 and 2% of the including return output tax', async () => withTestDb(async () => {
    const f = await org('invoice');
    try {
      const sale = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-07-15', dueDate: '2026-08-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'July consulting', quantity: '1', rate: '100' }] }, 201);
      await f.request(`/api/invoices/${sale.id}`, 'PATCH', { status: 'sent' });
      await filePeriod(f, '2026-07-01', '2026-08-31', 'MYIR-JUL-AUG-2026');
      const large = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-09-15', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Large September sale', quantity: '1', rate: '400000' }] }, 201);
      await f.request(`/api/invoices/${large.id}`, 'PATCH', { status: 'sent' });
      const twoPercent = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(twoPercent.gstOnSales).toBe('60000.00');
      expect(gstCorrectionCarryLimit(twoPercent.gstOnSales)).toBe('1200.00');
      const withinTwoPercent = await f.request<GstPeriodCorrection>('/api/tax/gst-corrections', 'POST', correctionBody(sale.id, '1200.00'), 201);
      expect(withinTwoPercent.carryForward).toBe('included');
      const overTwoPercent = await f.request<{ error: { code: string } }>('/api/tax/gst-corrections', 'POST', correctionBody(sale.id, '0.01'), 422);
      expect(overTwoPercent.error.code).toBe('GST_CORRECTION_OVER_LIMIT');
      await f.request(`/api/tax/gst-corrections/${withinTwoPercent.id}/resolve`, 'POST', { resolution: 'amend_in_myir', reason: 'Reset the two percent example before the cap' });
      const listed = await f.request<{ corrections: GstPeriodCorrection[] }>('/api/tax/gst-corrections?from=2026-09-01&to=2026-10-31');
      const stray = listed.corrections.find((row) => row.amount === '0.01');
      await f.request(`/api/tax/gst-corrections/${stray!.id}/resolve`, 'POST', { resolution: 'amend_in_myir', reason: 'The extra cent will be amended in myIR' });
      const further = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-15', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Further September sale', quantity: '1', rate: '3600000' }] }, 201);
      await f.request(`/api/invoices/${further.id}`, 'PATCH', { status: 'sent' });
      const capped = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(capped.gstOnSales).toBe('600000.00');
      expect(gstCorrectionCarryLimit(capped.gstOnSales)).toBe('10000.00');
      const atCap = await f.request<GstPeriodCorrection>('/api/tax/gst-corrections', 'POST', correctionBody(sale.id, '10000.00'), 201);
      expect(atCap).toMatchObject({ carryForward: 'included', limit: '10000.00' });
      const overCap = await f.request<{ error: { code: string; message: string } }>('/api/tax/gst-corrections', 'POST', correctionBody(sale.id, '0.01'), 422);
      expect(overCap.error.code).toBe('GST_CORRECTION_OVER_LIMIT');
      expect(overCap.error.message).toMatch(/myIR/);
    } finally { await f.sql.end(); }
  }));

  it('refuses a second 9000.00 correction from another filed period when the combined net would exceed 10000.00', async () => withTestDb(async () => {
    const f = await org('invoice');
    try {
      const july = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-07-15', dueDate: '2026-08-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'July consulting', quantity: '1', rate: '100' }] }, 201);
      await f.request(`/api/invoices/${july.id}`, 'PATCH', { status: 'sent' });
      await filePeriod(f, '2026-07-01', '2026-08-31', 'MYIR-JUL-AUG-2026');
      const september = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-09-15', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'September consulting', quantity: '1', rate: '100' }] }, 201);
      await f.request(`/api/invoices/${september.id}`, 'PATCH', { status: 'sent' });
      await filePeriod(f, '2026-09-01', '2026-10-31', 'MYIR-SEP-OCT-2026');
      const november = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-11-10', dueDate: '2026-11-30', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'November sale', quantity: '1', rate: '4000000' }] }, 201);
      await f.request(`/api/invoices/${november.id}`, 'PATCH', { status: 'sent' });
      const open = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-11-01&to=2026-12-31');
      expect(gstCorrectionCarryLimit(open.gstOnSales)).toBe('10000.00');
      const first = await f.request<GstPeriodCorrection>('/api/tax/gst-corrections', 'POST', correctionBody(july.id, '9000.00', { originalPeriodStart: '2026-07-01', originalPeriodEnd: '2026-08-31' }), 201);
      expect(first).toMatchObject({ status: 'pending', carryForward: 'included', targetPeriodStart: '2026-11-01', targetPeriodEnd: '2026-12-31', netDiscrepancy: '9000.00' });
      const second = await f.request<{ error: { code: string; message: string } }>('/api/tax/gst-corrections', 'POST', correctionBody(september.id, '9000.00', { originalPeriodStart: '2026-09-01', originalPeriodEnd: '2026-10-31' }), 422);
      expect(second.error.code).toBe('GST_CORRECTION_OVER_LIMIT');
      expect(second.error.message).toMatch(/myIR/);
      const combined = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-11-01&to=2026-12-31');
      expect(combined.calculation?.myIrBoxes['9']).toBe('9000.00');
      expect(combined.priorPeriodCorrections?.find((row) => row.amount === '9000.00' && row.originalPeriodStart === '2026-09-01')?.status).toBe('over_limit');
      expect(combined.priorPeriodCorrections?.find((row) => row.id === first.id)?.status).toBe('pending');
    } finally { await f.sql.end(); }
  }));

  it('places input and negative output corrections, nets an offsetting pair, and refuses a repeated or $12,000 row', async () => withTestDb(async () => {
    const f = await org('invoice');
    try {
      const sale = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-07-15', dueDate: '2026-08-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'July consulting', quantity: '1', rate: '100' }] }, 201);
      await f.request(`/api/invoices/${sale.id}`, 'PATCH', { status: 'sent' });
      await filePeriod(f, '2026-07-01', '2026-08-31', 'MYIR-JUL-AUG-2026');
      const before = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      const key = crypto.randomUUID();
      const large = correctionBody(sale.id, '12000.00');
      const refused = await f.request<{ error: { code: string; message: string } }>('/api/tax/gst-corrections', 'POST', large, 422, { 'Idempotency-Key': key });
      expect(refused.error.code).toBe('GST_CORRECTION_OVER_LIMIT');
      expect(refused.error.message).toMatch(/myIR/);
      const replay = await f.request<{ error: { code: string } }>('/api/tax/gst-corrections', 'POST', large, 422, { 'Idempotency-Key': key });
      expect(replay.error.code).toBe('GST_CORRECTION_OVER_LIMIT');
      const again = await f.request<{ error: { code: string } }>('/api/tax/gst-corrections', 'POST', large, 409);
      expect(again.error.code).toBe('GST_CORRECTION_DUPLICATE');
      const stored = await f.db.select({ id: gstPeriodCorrections.id }).from(gstPeriodCorrections).where(eq(gstPeriodCorrections.amount, '12000.00'));
      expect(stored).toHaveLength(1);
      const listed = await f.request<{ corrections: GstPeriodCorrection[] }>('/api/tax/gst-corrections?from=2026-09-01&to=2026-10-31');
      for (const row of listed.corrections) await f.request(`/api/tax/gst-corrections/${row.id}/resolve`, 'POST', { resolution: 'amend_in_myir', reason: 'The large amount will be amended in myIR' });
      const input = await f.request<GstPeriodCorrection>('/api/tax/gst-corrections', 'POST', { ...correctionBody(sale.id, '40.00'), kind: 'input', action: 'added' }, 201);
      const withInput = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(before.calculation?.myIrBoxes['15']).toBe('0.00');
      expect(withInput.calculation?.myIrBoxes['13']).toBe('40.00');
      expect(withInput.calculation?.myIrBoxes['15']).toBe('-40.00');
      await f.request(`/api/tax/gst-corrections/${input.id}/resolve`, 'POST', { resolution: 'amend_in_myir', reason: 'Reset the input example before the negative output' });
      await f.request('/api/tax/gst-corrections', 'POST', { ...correctionBody(sale.id, '-40.00'), action: 'voided' }, 201);
      const reduced = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(reduced.calculation?.myIrBoxes['9']).toBe('-40.00');
      const negative = reduced.priorPeriodCorrections?.find((row) => row.amount === '-40.00');
      await f.request(`/api/tax/gst-corrections/${negative!.id}/resolve`, 'POST', { resolution: 'amend_in_myir', reason: 'Reset the negative output example' });
      const output = await f.request<GstPeriodCorrection>('/api/tax/gst-corrections', 'POST', correctionBody(sale.id, '40.00'), 201);
      const offset = await f.request<GstPeriodCorrection>('/api/tax/gst-corrections', 'POST', { ...correctionBody(sale.id, '40.00'), kind: 'input', action: 'changed' }, 201);
      expect(offset).toMatchObject({ status: 'pending', carryForward: 'included', netDiscrepancy: '0.00' });
      const openPair = await f.request<{ corrections: GstPeriodCorrection[] }>('/api/tax/gst-corrections?from=2026-09-01&to=2026-10-31');
      expect(openPair.corrections.find((row) => row.id === output.id)?.netDiscrepancy).toBe('0.00');
      const paired = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(paired.calculation?.myIrBoxes['9']).toBe('40.00');
      expect(paired.calculation?.myIrBoxes['13']).toBe('40.00');
      const duplicate = await f.request<{ error: { code: string } }>('/api/tax/gst-corrections', 'POST', correctionBody(sale.id, '40.00'), 409);
      expect(duplicate.error.code).toBe('GST_CORRECTION_DUPLICATE');
      const [membership] = await f.db.select().from(organisationMemberships);
      await f.db.update(organisationMemberships).set({ role: 'member' }).where(eq(organisationMemberships.id, membership.id));
      expect((await f.request<{ error: { code: string } }>('/api/tax/gst-corrections', 'POST', { ...correctionBody(sale.id, '1.00'), action: 'voided' }, 403)).error.code).toBe('FORBIDDEN');
      await f.db.update(organisationMemberships).set({ role: 'read_only' }).where(eq(organisationMemberships.id, membership.id));
      expect((await f.request<{ error: { code: string } }>(`/api/tax/gst-corrections/${output.id}/resolve`, 'POST', { resolution: 'amend_in_myir', reason: 'Read only member tries to resolve it' }, 403)).error.code).toBe('FORBIDDEN');
    } finally { await f.sql.end(); }
  }));

  it('refuses a typed prior-period adjustment that is not linked to the filed return', async () => withTestDb(async () => {
    const f = await org('invoice');
    try {
      const refused = await f.request<{ error: { code: string } }>('/api/tax/gst-preparation', 'POST', {
        from: '2026-09-01', to: '2026-10-31', reviewConfirmed: true,
        adjustments: [{ kind: 'output', type: 'prior_period_correction', amount: '40.00', reason: 'Prior period difference found after filing', sourceReference: 'PP-1' }],
      }, 422);
      expect(refused.error.code).toBe('GST_CORRECTION_RECORDED_SEPARATELY');
    } finally { await f.sql.end(); }
  }));
});
