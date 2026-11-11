import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { lineItems } from '../../db/schema/invoices';
import type { CreateTaxReturnRequest, GstPreparationResponse, TaxReturnDto } from '@ledgercraft/contracts';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { organisationMemberships } from '../../db/schema/identity';
import { createAuth } from '../auth/auth';

const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const period = 'from=2026-09-01&to=2026-10-31';

async function registered(basis: 'invoice' | 'payments' | 'hybrid' = 'invoice') {
  const { db, sql } = createDb(getDatabaseUrl());
  const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'GST tax codes', email: `${crypto.randomUUID()}@example.test`, password: 'Local-GST-password123!' }) });
  const headers = { ...origin, Cookie: signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
  const request = async <T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, expected = 200) => {
    const response = await app.request(path, { method, headers: { ...headers, ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = response.status === 204 ? null : await response.json();
    expect(response.status, JSON.stringify(value)).toBe(expected);
    return value as T;
  };
  await request('/api/business-profile', 'PUT', { name: 'Kauri GST Limited', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15' });
  await request('/api/tax/gst-settings', 'PUT', { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: basis, gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 10 });
  const customer = await request<{ id: string }>('/api/customers', 'POST', { name: 'Harbour export', email: 'buyer@example.test' }, 201);
  return { db, sql, app, request, customerId: customer.id };
}

async function postSale(f: Awaited<ReturnType<typeof registered>>, body: Record<string, unknown>) {
  const invoice = await f.request<{ id: string; items: Array<{ taxCode?: string | null; tax: string | null; total: string }> }>('/api/invoices', 'POST', {
    customerId: f.customerId, currency: 'NZD', dueDate: '2026-10-31', ...body,
  }, 201);
  await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { status: 'sent' });
  return invoice;
}

function boxes(preparation: GstPreparationResponse) {
  return preparation.calculation?.myIrBoxes;
}

describe('sales tax codes feed GST boxes 5 and 6', () => {
  it('AC2 invoice basis puts the zero-rated export in boxes 5 and 6 and leaves the exempt sale out of box 5', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      const standard = await postSale(f, { date: '2026-09-15', taxInclusive: true, taxRate: '15', items: [{ description: 'Standard sale', quantity: '1', rate: '11500' }] });
      expect(standard.items[0].taxCode).toBe('standard_15');
      await postSale(f, { date: '2026-09-20', taxInclusive: false, taxRate: '0', items: [{ description: 'Zero-rated export', quantity: '1', rate: '2000', taxCode: 'zero_rated' }] });
      await postSale(f, { date: '2026-10-02', taxInclusive: false, taxRate: '0', items: [{ description: 'Exempt sale', quantity: '1', rate: '1000', taxCode: 'exempt' }] });
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(boxes(preparation)).toMatchObject({ '5': '13500.00', '6': '2000.00', '7': '11500.00', '8': '1500.00', '9': '0.00', '10': '1500.00' });
      expect(preparation).toMatchObject({ zeroRatedSales: '2000.00', exemptSales: '1000.00', unclassifiedSales: '0.00', totalSales: '14500.00', calculation: { version: 'gst-ledger-v2', mappingStatus: 'supported' } });
    } finally { await f.sql.end(); }
  }));

  it('AC2b payments basis matches when every supply is paid inside the period', async () => withTestDb(async () => {
    const f = await registered('payments');
    try {
      const standard = await postSale(f, { date: '2026-09-15', taxInclusive: true, taxRate: '15', items: [{ description: 'Standard sale', quantity: '1', rate: '11500' }] });
      const exported = await postSale(f, { date: '2026-09-20', taxInclusive: false, taxRate: '0', items: [{ description: 'Zero-rated export', quantity: '1', rate: '2000', taxCode: 'zero_rated' }] });
      const exempt = await postSale(f, { date: '2026-10-02', taxInclusive: false, taxRate: '0', items: [{ description: 'Exempt sale', quantity: '1', rate: '1000', taxCode: 'exempt' }] });
      for (const [invoice, amount, paymentDate] of [[standard, '11500.00', '2026-09-28'], [exported, '2000.00', '2026-10-04'], [exempt, '1000.00', '2026-10-18']] as const) {
        await f.request('/api/payments', 'POST', { invoiceId: invoice.id, amount, paymentDate, paymentMethod: 'bank_transfer' }, 201);
      }
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(boxes(preparation)).toMatchObject({ '5': '13500.00', '6': '2000.00', '7': '11500.00', '8': '1500.00', '9': '0.00', '10': '1500.00' });
      expect(preparation.calculation?.mappingStatus).toBe('supported');
    } finally { await f.sql.end(); }
  }));

  it('hybrid basis uses the invoice-date split for the same supplies', async () => withTestDb(async () => {
    const f = await registered('hybrid');
    try {
      await postSale(f, { date: '2026-09-15', taxInclusive: true, taxRate: '15', items: [{ description: 'Standard sale', quantity: '1', rate: '11500' }] });
      await postSale(f, { date: '2026-09-20', taxInclusive: false, taxRate: '0', items: [{ description: 'Zero-rated export', quantity: '1', rate: '2000', taxCode: 'zero_rated' }] });
      await postSale(f, { date: '2026-10-02', taxInclusive: false, taxRate: '0', items: [{ description: 'Exempt sale', quantity: '1', rate: '1000', taxCode: 'exempt' }] });
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(boxes(preparation)).toMatchObject({ '5': '13500.00', '6': '2000.00', '7': '11500.00', '10': '1500.00' });
    } finally { await f.sql.end(); }
  }));

  it('allocates a partial payment of a zero-rated invoice on the payments basis', async () => withTestDb(async () => {
    const f = await registered('payments');
    try {
      const invoice = await postSale(f, { date: '2026-09-12', taxInclusive: false, taxRate: '0', items: [{ description: 'Zero-rated export', quantity: '1', rate: '2000', taxCode: 'zero_rated' }] });
      await f.request('/api/payments', 'POST', { invoiceId: invoice.id, amount: '800.00', paymentDate: '2026-10-20', paymentMethod: 'bank_transfer' }, 201);
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(boxes(preparation)).toMatchObject({ '5': '800.00', '6': '800.00', '7': '0.00', '8': '0.00', '9': '0.00', '10': '0.00' });
    } finally { await f.sql.end(); }
  }));

  it('reduces boxes 5 and 6 by a credit note on a zero-rated line', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      const invoice = await postSale(f, { date: '2026-09-12', taxInclusive: false, taxRate: '0', items: [{ description: 'Zero-rated export', quantity: '1', rate: '2000', taxCode: 'zero_rated' }] });
      const credit = await f.request<{ items: Array<{ taxCode?: string }> }>('/api/credit-notes', 'POST', {
        invoiceId: invoice.id, issueDate: '2026-10-05', reason: 'Returned part of the export', taxInclusive: false, taxRate: '0',
        items: [{ description: 'Export credit', quantity: '1', rate: '500', taxCode: 'zero_rated' }],
      }, 201);
      expect(credit.items[0].taxCode).toBe('zero_rated');
      const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(boxes(preparation)).toMatchObject({ '5': '1500.00', '6': '1500.00' });
    } finally { await f.sql.end(); }
  }));

  it('keeps an exempt supply out of box 5 and still asks for confirmation of unclassified history', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      await postSale(f, { date: '2026-09-18', taxInclusive: false, taxRate: '0', items: [{ description: 'Exempt sale', quantity: '1', rate: '1000', taxCode: 'exempt' }] });
      const exemptOnly = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(exemptOnly).toMatchObject({ totalSales: '1000.00', exemptSales: '1000.00', zeroRatedSales: '0.00', unclassifiedSales: '0.00' });
      expect(boxes(exemptOnly)).toMatchObject({ '5': '0.00', '6': '0.00', '7': '0.00' });
      await postSale(f, { date: '2026-10-08', taxInclusive: false, taxRate: '0', items: [{ description: 'Older untaxed sale', quantity: '1', rate: '500' }] });
      const mixed = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`);
      expect(mixed).toMatchObject({ unclassifiedSales: '500.00', exemptSales: '1000.00', zeroRatedSales: '0.00', calculation: { mappingStatus: 'requires_confirmation' } });
      expect(mixed.calculation?.myIrBoxes['5']).toBeUndefined();
      expect(mixed.calculation?.myIrBoxes['6']).toBeUndefined();
      expect(mixed.warnings.join(' ')).toMatch(/zero-rated versus exempt/i);
    } finally { await f.sql.end(); }
  }));

  it('rejects a tax code that disagrees with the line GST and stores a quote code', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      const mismatch = await f.request<{ error: { code: string } }>('/api/invoices', 'POST', {
        customerId: f.customerId, date: '2026-09-15', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15',
        items: [{ description: 'Taxed export', quantity: '1', rate: '100', taxCode: 'zero_rated', taxes: [{ id: 'gst', name: 'GST', rate: '15' }] }],
      }, 422);
      expect(mismatch.error.code).toBe('SALES_TAX_CODE_MISMATCH');
      const rounded = await f.request<{ id: string; items: Array<{ taxCode?: string; tax: string | null }> }>('/api/invoices', 'POST', {
        customerId: f.customerId, date: '2026-09-16', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15',
        items: [
          { description: 'Normal sale', quantity: '1', rate: '100' },
          { description: 'One cent', quantity: '1', rate: '0.01', taxCode: 'standard_15', taxes: [{ id: 'gst', name: 'GST', rate: '15' }] },
        ],
      }, 201);
      expect(rounded.items.map((item) => item.taxCode)).toEqual(['standard_15', 'standard_15']);
      expect(rounded.items[1].tax).toBe('0.00');
      await f.request(`/api/invoices/${rounded.id}`, 'PATCH', { status: 'sent' });
      const tiny = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-09-01&to=2026-10-31');
      expect(tiny.calculation).toMatchObject({ mappingStatus: 'supported', myIrBoxes: { '5': '115.01', '6': '0.00', '7': '115.01', '8': '15.00', '9': '0.00', '10': '15.00' } });
      const quote = await f.request<{ items: Array<{ taxCode?: string }> }>('/api/quotes', 'POST', {
        customerId: f.customerId, date: '2026-09-01', expiryDate: '2026-10-01', taxInclusive: false, taxRate: '0',
        items: [{ description: 'Export quote', quantity: '1', rate: '50', taxCode: 'zero_rated' }],
      }, 201);
      expect(quote.items[0].taxCode).toBe('zero_rated');
    } finally { await f.sql.end(); }
  }));
});

function draft(preparation: GstPreparationResponse): CreateTaxReturnRequest {
  return {
    periodStart: preparation.from, periodEnd: preparation.to, returnType: 'GST', totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases,
    gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition,
    returnData: { preparation: { basis: preparation.basis, baseCurrency: 'NZD', calculationFingerprint: preparation.calculation!.fingerprint }, ...(preparation.review ? { gstReview: preparation.review } : {}) },
  };
}

describe('bulk reclassify of unclassified 0% sales', () => {
  it('previews, applies, audits and undoes a zero-rated assignment', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      const invoice = await postSale(f, { date: '2026-09-22', taxInclusive: false, taxRate: '0', items: [{ description: 'Older export', quantity: '1', rate: '2000' }] });
      const listed = await f.request<{ lines: Array<{ id: string; description: string; total: string }>; events: unknown[] }>('/api/tax/sales-tax-reclassifications');
      expect(listed.lines).toEqual([expect.objectContaining({ description: 'Older export', total: '2000.00', taxCode: null })]);
      expect(listed.events).toEqual([]);
      const lineId = listed.lines[0].id;
      const [beforeLine] = await f.db.select({ updatedAt: lineItems.updatedAt, taxCode: lineItems.taxCode }).from(lineItems).where(eq(lineItems.id, lineId));
      const preview = await f.request<{ before: { box5: string | null; box6: string | null; mappingStatus: string }; after: { box5: string | null; box6: string | null; unclassifiedSales: string; zeroRatedSales: string; mappingStatus: string } }>('/api/tax/sales-tax-reclassifications/preview', 'POST', { lineIds: [lineId], taxCode: 'zero_rated' });
      const [afterLine] = await f.db.select({ updatedAt: lineItems.updatedAt, taxCode: lineItems.taxCode }).from(lineItems).where(eq(lineItems.id, lineId));
      expect(afterLine.taxCode).toBeNull();
      expect(afterLine.updatedAt?.getTime()).toBe(beforeLine.updatedAt?.getTime());
      expect(preview.before).toMatchObject({ box5: null, box6: null, mappingStatus: 'requires_confirmation' });
      expect(preview.after).toMatchObject({ box5: '2000.00', box6: '2000.00', unclassifiedSales: '0.00', zeroRatedSales: '2000.00', mappingStatus: 'supported' });
      expect((await f.request<{ items: Array<{ taxCode?: string }> }>(`/api/invoices/${invoice.id}`)).items[0].taxCode).toBeUndefined();
      const applied = await f.request<{ id: string; action: string; taxCode: string; lineIds: string[]; after: { box6: string | null } }>('/api/tax/sales-tax-reclassifications', 'POST', { lineIds: [lineId], taxCode: 'zero_rated', reason: 'Reviewed export documents' }, 201);
      expect(applied).toMatchObject({ action: 'apply', taxCode: 'zero_rated', lineIds: [lineId], after: { box6: '2000.00' } });
      expect((await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`)).calculation?.myIrBoxes).toMatchObject({ '5': '2000.00', '6': '2000.00' });
      const audited = await f.request<{ lines: unknown[]; events: Array<{ id: string; action: string }> }>('/api/tax/sales-tax-reclassifications');
      expect(audited.lines).toEqual([]);
      expect(audited.events.map((event) => event.action)).toEqual(['apply']);
      const undone = await f.request<{ action: string; after: { mappingStatus: string; box6: string | null } }>(`/api/tax/sales-tax-reclassifications/${applied.id}/undo`, 'POST', { reason: 'Assigned the wrong code' });
      expect(undone).toMatchObject({ action: 'undo', after: { mappingStatus: 'requires_confirmation', box6: null } });
      expect((await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?${period}`)).unclassifiedSales).toBe('2000.00');
      await f.request(`/api/tax/sales-tax-reclassifications/${applied.id}/undo`, 'POST', { reason: 'Assigned the wrong code' }, 409);
    } finally { await f.sql.end(); }
  }));

  it('refuses a filed period and a role that is not owner or admin', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      await postSale(f, { date: '2026-09-22', taxInclusive: false, taxRate: '0', items: [{ description: 'Older export', quantity: '1', rate: '2000' }] });
      const lineId = (await f.request<{ lines: Array<{ id: string }> }>('/api/tax/sales-tax-reclassifications')).lines[0].id;
      const reviewed = await f.request<GstPreparationResponse>('/api/tax/gst-preparation', 'POST', {
        from: '2026-09-01', to: '2026-10-31', reviewConfirmed: true, adjustments: [],
        salesClassificationReview: { zeroRatedSales: '2000.00', exemptSales: '0.00', reason: 'Reviewed export file', sourceReference: 'EXP-1' },
      });
      const saved = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(reviewed), 201);
      await f.request(`/api/tax-returns/${saved.id}/file`, 'POST', { irdReference: 'GST-2026-SEP-OCT' });
      const refused = await f.request<{ error: { code: string } }>('/api/tax/sales-tax-reclassifications', 'POST', { lineIds: [lineId], taxCode: 'exempt', reason: 'Tried after filing' }, 409);
      expect(refused.error.code).toBe('GST_PERIOD_FILED');
      expect((await f.request<{ lines: unknown[] }>('/api/tax/sales-tax-reclassifications')).lines).toEqual([]);
      await f.request(`/api/tax-returns/${saved.id}/reopen`, 'POST', { reason: 'Reopen so the role check has an open period' });
      const [membership] = await f.db.select().from(organisationMemberships);
      await f.db.update(organisationMemberships).set({ role: 'accountant' }).where(eq(organisationMemberships.id, membership.id));
      const accountant = await f.request<{ error: { code: string } }>('/api/tax/sales-tax-reclassifications/preview', 'POST', { lineIds: [lineId], taxCode: 'exempt' }, 403);
      expect(accountant.error.code).toBe('FORBIDDEN');
      await f.db.update(organisationMemberships).set({ role: 'member' }).where(eq(organisationMemberships.id, membership.id));
      await f.request('/api/tax/sales-tax-reclassifications/preview', 'POST', { lineIds: [lineId], taxCode: 'exempt' }, 403);
      await f.request('/api/tax/sales-tax-reclassifications', 'GET', undefined, 403);
    } finally { await f.sql.end(); }
  }));

  it('previews Box 5 and Box 6 for the whole GST period, including a supply on another day', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      await postSale(f, { date: '2026-09-15', taxInclusive: true, taxRate: '15', items: [{ description: 'Standard sale', quantity: '1', rate: '11500' }] });
      await postSale(f, { date: '2026-10-02', taxInclusive: false, taxRate: '0', items: [{ description: 'Older export', quantity: '1', rate: '2000' }] });
      const lineId = (await f.request<{ lines: Array<{ id: string }> }>('/api/tax/sales-tax-reclassifications')).lines[0].id;
      const preview = await f.request<{ after: { box5: string | null; box6: string | null }; periods: Array<{ from: string; to: string; after: { box5: string | null; box6: string | null } }> }>('/api/tax/sales-tax-reclassifications/preview', 'POST', { lineIds: [lineId], taxCode: 'zero_rated' });
      expect(preview.periods).toEqual([expect.objectContaining({ from: '2026-09-01', to: '2026-10-31' })]);
      expect(preview.after).toMatchObject({ box5: '13500.00', box6: '2000.00' });
      expect(preview.periods[0].after).toMatchObject({ box5: '13500.00', box6: '2000.00' });
    } finally { await f.sql.end(); }
  }));

  it('refuses reclassify and undo when a later credit note is in a filed period', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      const invoice = await postSale(f, { date: '2026-06-15', taxInclusive: false, taxRate: '0', items: [{ description: 'Open period export', quantity: '1', rate: '100' }] });
      await f.request('/api/credit-notes', 'POST', {
        invoiceId: invoice.id, issueDate: '2026-07-10', reason: 'Returned part of the export', taxInclusive: false, taxRate: '0',
        items: [{ description: 'Export credit', quantity: '1', rate: '20' }],
      }, 201);
      const lineId = (await f.request<{ lines: Array<{ id: string }> }>('/api/tax/sales-tax-reclassifications')).lines[0].id;
      const open = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-07-01&to=2026-08-31');
      const reviewed = await f.request<GstPreparationResponse>('/api/tax/gst-preparation', 'POST', {
        from: '2026-07-01', to: '2026-08-31', reviewConfirmed: true, adjustments: [],
        salesClassificationReview: { zeroRatedSales: open.unclassifiedSales ?? '0.00', exemptSales: '0.00', reason: 'Reviewed the July credit', sourceReference: 'CN-JULY' },
      });
      const saved = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(reviewed), 201);
      await f.request(`/api/tax-returns/${saved.id}/file`, 'POST', { irdReference: 'GST-2026-JUL-AUG' });
      const refused = await f.request<{ error: { code: string } }>('/api/tax/sales-tax-reclassifications', 'POST', { lineIds: [lineId], taxCode: 'zero_rated', reason: 'Tried after the credit was filed' }, 409);
      expect(refused.error.code).toBe('GST_PERIOD_FILED');
      await f.request(`/api/tax-returns/${saved.id}/reopen`, 'POST', { reason: 'Reopen to record the code, then file again' });
      const applied = await f.request<{ id: string }>('/api/tax/sales-tax-reclassifications', 'POST', { lineIds: [lineId], taxCode: 'zero_rated', reason: 'Reviewed export documents' }, 201);
      const again = await f.request<GstPreparationResponse>('/api/tax/gst-preparation', 'POST', {
        from: '2026-07-01', to: '2026-08-31', reviewConfirmed: true, adjustments: [],
      });
      const refiled = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', draft(again), 201);
      await f.request(`/api/tax-returns/${refiled.id}/file`, 'POST', { irdReference: 'GST-2026-JUL-AUG-2' });
      const undo = await f.request<{ error: { code: string } }>(`/api/tax/sales-tax-reclassifications/${applied.id}/undo`, 'POST', { reason: 'Undo after the credit period was filed' }, 409);
      expect(undo.error.code).toBe('GST_PERIOD_FILED');
    } finally { await f.sql.end(); }
  }));

  it('copies the invoice supply code onto a credit note and rejects a different code', async () => withTestDb(async () => {
    const f = await registered('invoice');
    try {
      const invoice = await postSale(f, { date: '2026-09-12', taxInclusive: false, taxRate: '0', items: [{ description: 'Zero-rated export', quantity: '1', rate: '200', taxCode: 'zero_rated' }] });
      const copied = await f.request<{ items: Array<{ taxCode?: string }> }>('/api/credit-notes', 'POST', {
        invoiceId: invoice.id, issueDate: '2026-09-20', reason: 'Returned part of the export', taxInclusive: false, taxRate: '0',
        items: [{ description: 'Export credit', quantity: '1', rate: '20' }],
      }, 201);
      expect(copied.items[0].taxCode).toBe('zero_rated');
      const mismatch = await f.request<{ error: { code: string } }>('/api/credit-notes', 'POST', {
        invoiceId: invoice.id, issueDate: '2026-09-21', reason: 'Returned more of the export', taxInclusive: false, taxRate: '0',
        items: [{ description: 'Export credit', quantity: '1', rate: '20', taxCode: 'exempt' }],
      }, 422);
      expect(mismatch.error.code).toBe('SALES_TAX_CODE_MISMATCH');
    } finally { await f.sql.end(); }
  }));
});
