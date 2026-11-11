import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { CustomsGstEntry, GstPreparationResponse, TaxReturnDto } from '@ledgercraft/contracts';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { organisationMemberships } from '../../db/schema/identity';
import { taxReturns } from '../../db/schema/tax';
import { journalEntries } from '../../db/schema/accounts';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const period = 'from=2026-09-01&to=2026-10-31';

async function registered(basis: 'invoice' | 'payments' | 'hybrid' = 'invoice') {
  const { db, sql } = createDb(getDatabaseUrl());
  const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'GST customs', email: `${crypto.randomUUID()}@example.test`, password: 'Local-GST-password123!' }) });
  const headers = { ...origin, Cookie: signup.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ') };
  const request = async <T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, expected = 200) => {
    const response = await app.request(path, { method, headers: { ...headers, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = response.status === 204 ? null : await response.json();
    expect(response.status, `${method} ${path} ${JSON.stringify(value)}`).toBe(expected);
    return value as T;
  };
  await request('/api/business-profile', 'PUT', { name: 'Kauri GST Limited', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15' });
  await request('/api/tax/gst-settings', 'PUT', { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: basis, gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 10 });
  const customer = await request<{ id: string }>('/api/customers', 'POST', { name: 'Harbour export', email: 'buyer@example.test' }, 201);
  const vendor = await request<{ id: string }>('/api/vendors', 'POST', { name: 'Importer' }, 201);
  const account = await request<{ id: string }>('/api/accounts', 'POST', { name: 'Purchases', type: 'expense', accountClass: 'expense', accountNumber: '5300' }, 201);
  const bank = await request<{ id: string }>('/api/bank-accounts', 'POST', { accountName: 'Operating', accountNumber: '12-3456-000001-00', bankName: 'Test', accountType: 'checking', currency: 'NZD' }, 201);
  return { db, sql, request, customerId: customer.id, vendorId: vendor.id, accountId: account.id, bankId: bank.id };
}

async function sale(f: Awaited<ReturnType<typeof registered>>, body: Record<string, unknown>) {
  const invoice = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customerId, currency: 'NZD', dueDate: '2026-10-31', ...body }, 201);
  await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
  return invoice;
}

async function ac2Books(f: Awaited<ReturnType<typeof registered>>, pay: boolean) {
  const standard = await sale(f, { date: '2026-09-15', taxInclusive: true, taxRate: '15', items: [{ description: 'Standard sale', quantity: '1', rate: '11500' }] });
  const exported = await sale(f, { date: '2026-09-20', taxInclusive: false, taxRate: '0', items: [{ description: 'Zero-rated export', quantity: '1', rate: '2000', taxCode: 'zero_rated' }] });
  const exempt = await sale(f, { date: '2026-10-02', taxInclusive: false, taxRate: '0', items: [{ description: 'Exempt sale', quantity: '1', rate: '1000', taxCode: 'exempt' }] });
  const bill = await f.request<{ id: string }>('/api/bills', 'POST', { vendorId: f.vendorId, issueDate: '2026-09-18', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Stock', quantity: '1', unitPrice: '2300', taxRate: '15', accountId: f.accountId }] }, 201);
  await f.request(`/api/bills/${bill.id}/receive`, 'POST', {});
  await f.request('/api/expenses', 'POST', { description: 'Partly private cost', amount: '460.00', taxAmount: '60.00', gstTreatment: 'standard', privateUsePercentage: 25, currency: 'NZD', status: 'approved', expenseDate: '2026-09-22' }, 201);
  await f.request('/api/expenses', 'POST', { description: 'GST-free bank fee', amount: '20.00', taxAmount: '0.00', gstTreatment: 'exempt', currency: 'NZD', status: 'approved', expenseDate: '2026-10-03' }, 201);
  if (pay) {
    for (const [invoice, amount, paymentDate] of [[standard, '11500.00', '2026-09-28'], [exported, '2000.00', '2026-10-04'], [exempt, '1000.00', '2026-10-18']] as const) {
      await f.request('/api/payments', 'POST', { invoiceId: invoice.id, amount, paymentDate, paymentMethod: 'bank_transfer' }, 201);
    }
    await f.request(`/api/bills/${bill.id}/payments`, 'POST', { bankAccountId: f.bankId, amount: '2300.00', paymentDate: '2026-10-12' }, 201);
  }
}

const ac2Boxes = { '5': '13500.00', '6': '2000.00', '7': '11500.00', '8': '1500.00', '9': '0.00', '10': '1500.00', '11': '2645.00', '12': '345.00', '13': '150.00', '14': '495.00', '15': '1005.00' };

function v3(preparation: GstPreparationResponse) {
  if (preparation.calculation?.version !== 'gst-ledger-v3') throw new Error('expected gst-ledger-v3');
  return preparation.calculation;
}

async function fileStored(f: Awaited<ReturnType<typeof registered>>, preparation: GstPreparationResponse, reference: string) {
  const draft = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', {
    periodStart: '2026-09-01', periodEnd: '2026-10-31', returnType: 'GST', totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases,
    gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition,
    returnData: { preparation: { basis: preparation.basis, baseCurrency: 'NZD', calculationFingerprint: preparation.calculation!.fingerprint } },
  }, 201);
  return f.request<TaxReturnDto>(`/api/tax-returns/${draft.id}/file`, 'POST', { irdReference: reference });
}

describe('typed adjustments, rounding and Customs GST', () => {
  it('AC2 invoice basis puts the $150 Customs GST entry in Box 13 and leaves Box 11 unchanged', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      await ac2Books(f, false);
      const before = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(before.calculation?.myIrBoxes['11']).toBe('2645.00');
      expect(before.calculation?.myIrBoxes['13']).toBe('0.00');
      const entry = await f.request<CustomsGstEntry>('/api/tax/customs-gst', 'POST', { invoiceDate: '2026-10-20', paymentDate: '2026-10-28', amount: '150.00', reference: 'CUS-150', description: 'Customs GST on imported stock' }, 201);
      expect(entry.claimDate).toBe('2026-10-20');
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(preparation.calculation?.myIrBoxes).toMatchObject(ac2Boxes);
      expect(preparation.gstOnPurchases).toBe('495.00');
      expect(preparation.netGstPosition).toBe('1005.00');
      const calculation = v3(preparation);
      expect(calculation).toMatchObject({ mappingStatus: 'supported', customsGst: '150.00', rounding: { output: '0.00', input: '0.00' }, roundingReviewRequired: false, result: 'payable' });
      const filed = await fileStored(f, preparation, 'MYIR-AC2');
      expect(filed.status).toBe('submitted');
      expect(filed.netGst).toBe('1005.00');
      expect(filed.gstOnPurchases).toBe('495.00');
    } finally { await f.sql.end(); }
  }));

  it('AC2b payments basis matches when the Customs GST entry and every supply are paid in the period', async () => withTestDb(async () => {
    const f = await registered('payments');
    try {
      await ac2Books(f, true);
      const unpaid = await f.request<CustomsGstEntry>('/api/tax/customs-gst', 'POST', { invoiceDate: '2026-09-30', amount: '150.00', reference: 'CUS-UNPAID', description: 'Unpaid customs assessment' }, 201);
      expect(unpaid.claimDate).toBeNull();
      const before = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(before.calculation?.myIrBoxes['11']).toBe('2645.00');
      expect(before.calculation?.myIrBoxes['13']).toBe('0.00');
      expect(before.gstOnPurchases).toBe('345.00');
      expect(before.netGstPosition).toBe('1155.00');
      expect(v3(before)).toMatchObject({ customsGst: '0.00', rounding: { output: '0.00', input: '0.00' }, roundingReviewRequired: false });
      const paid = await f.request<CustomsGstEntry>(`/api/tax/customs-gst/${unpaid.id}/payment`, 'POST', { paymentDate: '2026-10-16' });
      expect(paid.claimDate).toBe('2026-10-16');
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(preparation.calculation?.myIrBoxes).toMatchObject(ac2Boxes);
      expect(preparation.gstOnPurchases).toBe('495.00');
      expect(preparation.netGstPosition).toBe('1005.00');
      expect(v3(preparation)).toMatchObject({ mappingStatus: 'supported', customsGst: '150.00', rounding: { output: '0.00', input: '0.00' }, roundingReviewRequired: false, myIrBoxes: { '15': '1005.00' } });
      const filed = await fileStored(f, preparation, 'MYIR-AC2B');
      expect(filed.netGst).toBe('1005.00');
      expect(filed.gstOnPurchases).toBe('495.00');
    } finally { await f.sql.end(); }
  }));

  it('AC4 discloses the one-cent ledger difference and keeps Box 9 at zero', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      await sale(f, { date: '2026-09-04', taxInclusive: true, taxRate: '15', items: [{ description: 'Small sale', quantity: '1', rate: '100.01' }] });
      await sale(f, { date: '2026-10-04', taxInclusive: true, taxRate: '15', items: [{ description: 'Small sale', quantity: '1', rate: '100.01' }] });
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(preparation.gstOnSales).toBe('26.08');
      expect(preparation.calculation?.myIrBoxes).toMatchObject({ '5': '200.02', '7': '200.02', '8': '26.09', '9': '0.00', '10': '26.09' });
      if (preparation.calculation?.version !== 'gst-ledger-v3') throw new Error('expected gst-ledger-v3');
      expect(preparation.calculation.rounding).toEqual({ output: '-0.01', input: '0.00' });
      expect(preparation.calculation.roundingReviewRequired).toBe(false);
      expect(preparation.review?.adjustments ?? []).toEqual([]);
      const reviewed = await f.request<GstPreparationResponse>('/api/tax/gst-preparation', 'POST', {
        from: '2026-09-01', to: '2026-10-31', reviewConfirmed: true,
        adjustments: [{ kind: 'output', type: 'private_use_output', amount: '10.00', reason: 'Private use of a business asset', sourceReference: 'PU-1' }],
      });
      expect(reviewed.calculation?.myIrBoxes['9']).toBe('10.00');
      expect(reviewed.calculation?.myIrBoxes['8']).toBe('26.09');
      if (reviewed.calculation?.version !== 'gst-ledger-v3') throw new Error('expected gst-ledger-v3');
      expect(reviewed.calculation.rounding.output).toBe('-0.01');
      expect(reviewed.gstOnSales).toBe('36.08');
    } finally { await f.sql.end(); }
  }));

  it('claims invoice-basis Customs GST on the earlier payment and keeps it out of Box 11', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      const entry = await f.request<CustomsGstEntry>('/api/tax/customs-gst', 'POST', { invoiceDate: '2026-10-20', paymentDate: '2026-10-05', amount: '150.00', reference: 'CUS-EARLY', description: 'Paid before the assessment' }, 201);
      expect(entry.claimDate).toBe('2026-10-05');
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(preparation.calculation?.myIrBoxes).toMatchObject({ '11': '0.00', '12': '0.00', '13': '150.00', '14': '150.00' });
      expect(preparation.gstOnPurchases).toBe('150.00');
    } finally { await f.sql.end(); }
  }));

  it('hybrid basis claims Customs GST only when it is paid', async () => withTestDb(async () => {
    const f = await registered('hybrid');
    try {
      const unpaid = await f.request<CustomsGstEntry>('/api/tax/customs-gst', 'POST', { invoiceDate: '2026-10-08', amount: '150.00', reference: 'CUS-HYBRID', description: 'Unpaid import assessment' }, 201);
      expect(unpaid.claimDate).toBeNull();
      const waiting = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(waiting.gstOnPurchases).toBe('0.00');
      expect(waiting.calculation?.myIrBoxes['13']).toBe('0.00');
      expect(v3(waiting).rounding).toEqual({ output: '0.00', input: '0.00' });
      await f.request(`/api/tax/customs-gst/${unpaid.id}/payment`, 'POST', { paymentDate: '2026-10-21' });
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(preparation.gstOnPurchases).toBe('150.00');
      expect(preparation.netGstPosition).toBe('-150.00');
      expect(preparation.calculation?.myIrBoxes).toMatchObject({ '11': '0.00', '13': '150.00', '15': '-150.00' });
      expect(v3(preparation)).toMatchObject({ rounding: { output: '0.00', input: '0.00' }, roundingReviewRequired: false });
      await f.request(`/api/tax/customs-gst/${unpaid.id}/void`, 'POST', { reason: 'Assessment was cancelled' });
      expect((await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`)).calculation?.myIrBoxes['13']).toBe('0.00');
    } finally { await f.sql.end(); }
  }));

  it('blocks a filed period Customs GST entry and a later payment still lands in the next period', async () => withTestDb(async () => {
    const f = await registered('payments');
    try {
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      const draft = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', {
        periodStart: '2026-09-01', periodEnd: '2026-10-31', returnType: 'GST', totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases,
        gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition,
        returnData: { preparation: { basis: preparation.basis, baseCurrency: 'NZD', calculationFingerprint: preparation.calculation!.fingerprint } },
      }, 201);
      await f.request(`/api/tax-returns/${draft.id}/file`, 'POST', { irdReference: 'MYIR-SEP-OCT' });
      const locked = await f.request<{ error: { code: string } }>('/api/tax/customs-gst', 'POST', { invoiceDate: '2026-10-01', paymentDate: '2026-10-20', amount: '150.00', reference: 'CUS-LOCK', description: 'Inside the filed period' }, 409);
      expect(locked.error.code).toBe('GST_PERIOD_FILED');
      const open = await f.request<CustomsGstEntry>('/api/tax/customs-gst', 'POST', { invoiceDate: '2026-10-20', amount: '150.00', reference: 'CUS-NEXT', description: 'Assessment in the filed period, unpaid' }, 201);
      const refused = await f.request<{ error: { code: string } }>(`/api/tax/customs-gst/${open.id}/payment`, 'POST', { paymentDate: '2026-10-28' }, 409);
      expect(refused.error.code).toBe('GST_PERIOD_FILED');
      await f.request(`/api/tax/customs-gst/${open.id}/payment`, 'POST', { paymentDate: '2026-11-03' });
      const october = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(october.gstOnPurchases).toBe('0.00');
      expect(october.calculation?.myIrBoxes['13']).toBe('0.00');
      const next = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-11-01&to=2026-12-31');
      expect(next.gstOnPurchases).toBe('150.00');
      expect(next.netGstPosition).toBe('-150.00');
      expect(next.calculation?.myIrBoxes).toMatchObject({ '11': '0.00', '13': '150.00', '15': '-150.00' });
      expect(v3(next)).toMatchObject({ rounding: { output: '0.00', input: '0.00' }, roundingReviewRequired: false });
    } finally { await f.sql.end(); }
  }));

  it('lets an invoice-basis settlement fall in an open period after the assessment period is filed', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      const entry = await f.request<CustomsGstEntry>('/api/tax/customs-gst', 'POST', { invoiceDate: '2026-10-12', amount: '150.00', reference: 'CUS-LATER', description: 'Claimed on the assessment, paid later' }, 201);
      expect(entry.claimDate).toBe('2026-10-12');
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(preparation.gstOnPurchases).toBe('150.00');
      expect(preparation.calculation?.myIrBoxes['13']).toBe('150.00');
      await fileStored(f, preparation, 'MYIR-INVOICE-LOCK');
      const paid = await f.request<CustomsGstEntry>(`/api/tax/customs-gst/${entry.id}/payment`, 'POST', { paymentDate: '2026-11-04' });
      expect(paid.paymentDate).toBe('2026-11-04');
      expect(paid.claimDate).toBe('2026-10-12');
      const october = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(october.gstOnPurchases).toBe('150.00');
      expect(october.calculation?.myIrBoxes).toMatchObject({ '11': '0.00', '13': '150.00' });
      const refused = await f.request<{ error: { code: string } }>(`/api/tax/customs-gst/${entry.id}/void`, 'POST', { reason: 'Try to remove a filed claim' }, 409);
      expect(refused.error.code).toBe('GST_PERIOD_FILED');
    } finally { await f.sql.end(); }
  }));

  it('blocks filing when rounding is over $1.00 until it is acknowledged', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      for (let index = 0; index < 250; index += 1) {
        const day = String((index % 28) + 1).padStart(2, '0');
        const month = index < 125 ? '09' : '10';
        await sale(f, { date: `2026-${month}-${day}`, taxInclusive: true, taxRate: '15', items: [{ description: `Sale ${index}`, quantity: '1', rate: '100.01' }] });
      }
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      if (preparation.calculation?.version !== 'gst-ledger-v3') throw new Error('expected gst-ledger-v3');
      expect(preparation.calculation.roundingReviewRequired).toBe(true);
      expect(preparation.calculation?.myIrBoxes['9']).toBe('0.00');
      const draft = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', {
        periodStart: preparation.from, periodEnd: preparation.to, returnType: 'GST', totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases,
        gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition,
        returnData: { preparation: { basis: preparation.basis, baseCurrency: 'NZD', calculationFingerprint: preparation.calculation!.fingerprint } },
      }, 201);
      const blocked = await f.request<{ error: { code: string } }>(`/api/tax-returns/${draft.id}/file`, 'POST', { irdReference: 'MYIR-ROUND' }, 422);
      expect(blocked.error.code).toBe('GST_ROUNDING_REVIEW_REQUIRED');
      const filed = await f.request<TaxReturnDto>(`/api/tax-returns/${draft.id}/file`, 'POST', { irdReference: 'MYIR-ROUND', acknowledgeRounding: true });
      expect(filed.status).toBe('submitted');
      expect(filed.returnData?.roundingAcknowledgement?.acknowledgedBy).toBeTruthy();
    } finally { await f.sql.end(); }
  }), 180000);

  it('maps an existing free-text adjustment to other without changing its amount', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      const [membership] = await f.db.select().from(organisationMemberships).limit(1);
      const beforeJournals = await f.db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.organisationId, membership.organisationId));
      await f.db.insert(taxReturns).values({
        organisationId: membership.organisationId, userId: membership.userId, periodStart: '2026-04-01', periodEnd: '2026-04-30', returnType: 'GST',
        totalSales: '1495.00', totalPurchases: '0.00', gstOnSales: '195.00', gstOnPurchases: '0.00', netGst: '195.00', status: 'draft',
        returnData: { gstReview: { confirmed: true, reviewedAt: '2026-05-01T00:00:00.000Z', reviewedBy: membership.userId, adjustments: [{ kind: 'output', amount: '-15.00', grossAdjustment: '-115.00', reason: 'Credit note issued for services returned', sourceReference: 'CN-001' }], unadjustedGstOnSales: '210.00', unadjustedGstOnPurchases: '0.00' } },
      });
      const update = readFileSync(new URL('../../../sqlite-migrations/0041_gst-typed-adjustments-customs.sql', import.meta.url), 'utf8').split('--> statement-breakpoint').map((part) => part.trim()).find((part) => part.startsWith('UPDATE'));
      await f.sql.exec(update!);
      const [row] = await f.db.select().from(taxReturns).where(eq(taxReturns.organisationId, membership.organisationId));
      const adjustments = (row.returnData as { gstReview: { adjustments: Array<Record<string, string>> } }).gstReview.adjustments;
      expect(adjustments).toEqual([{ kind: 'output', type: 'other', amount: '-15.00', grossAdjustment: '-115.00', reason: 'Credit note issued for services returned', sourceReference: 'CN-001', note: 'Credit note issued for services returned' }]);
      const afterJournals = await f.db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.organisationId, membership.organisationId));
      expect(afterJournals).toEqual(beforeJournals);
    } finally { await f.sql.end(); }
  }));
});
