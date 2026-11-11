import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { GstPreparationResponse, TaxReturnDto } from '@ledgercraft/contracts';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { organisationMemberships } from '../../db/schema/identity';
import { gstReturnAuditEvents } from '../../db/schema/tax';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';
import { gstLockApplies } from './gst-period-lock';

const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
const period = { from: '2026-09-01', to: '2026-10-31' };
type Basis = 'invoice' | 'payments' | 'hybrid';

async function org(basis: Basis) {
  const { db, sql } = createDb(getDatabaseUrl());
  const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
  const signup = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'GST lock owner', email: `${crypto.randomUUID()}@example.test`, password: 'Local-GST-lock-2026!' }) });
  const headers = { ...origin, Cookie: signup.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ') };
  const request = async <T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown, expected = 200, extra?: Record<string, string>) => {
    const response = await app.request(path, { method, headers: { ...headers, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = response.status === 204 ? null : await response.json();
    expect(response.status, `${method} ${path} ${JSON.stringify(value)}`).toBe(expected);
    return value as T;
  };
  await request('/api/business-profile', 'PUT', { name: 'Kauri GST Limited', email: 'owner@example.test', country: 'NZ', defaultTaxRate: '15' });
  await request('/api/tax/gst-settings', 'PUT', { gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-07-01', gstAccountingBasis: basis, gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 10 });
  const chart = await request<{ accounts: Array<{ id: string; accountNumber: string | null }> }>('/api/accounts/initialize', 'POST', {});
  const account = (number: string) => {
    const row = chart.accounts.find((item) => item.accountNumber === number);
    if (!row) throw new Error(`Missing account ${number}`);
    return row.id;
  };
  const customer = await request<{ id: string }>('/api/customers', 'POST', { name: 'Harbour cafe', email: 'buyer@example.test' }, 201);
  const vendor = await request<{ id: string }>('/api/vendors', 'POST', { name: 'Subcontractor' }, 201);
  const bank = await request<{ id: string }>('/api/bank-accounts', 'POST', { accountName: 'Operating', accountNumber: '12-3456-000001-00', bankName: 'Test', accountType: 'checking', currency: 'NZD' }, 201);
  const expenseAccount = await request<{ id: string }>('/api/accounts', 'POST', { name: 'Operating costs', type: 'expense', accountClass: 'expense', accountNumber: '5000' }, 201);
  return { db, sql, app, request, customer, vendor, bank, expenseAccount, outputGst: account('2200'), bankLedger: account('1110') };
}

async function invoice(f: Awaited<ReturnType<typeof org>>, date: string, send = true) {
  const created = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date, dueDate: '2026-11-30', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Consulting', quantity: '1', rate: '1000' }] }, 201);
  if (send) await f.request(`/api/invoices/${created.id}`, 'PATCH', { status: 'sent' });
  return created;
}

async function filePeriod(f: Awaited<ReturnType<typeof org>>) {
  const preparation = await f.request<GstPreparationResponse>(`/api/tax/gst-preparation?from=${period.from}&to=${period.to}`);
  expect(preparation.calculation?.mappingStatus).toBe('supported');
  const draft = await f.request<TaxReturnDto>('/api/tax-returns', 'POST', {
    periodStart: period.from, periodEnd: period.to, returnType: 'GST',
    totalSales: preparation.totalSales, totalPurchases: preparation.totalPurchases,
    gstOnSales: preparation.gstOnSales, gstOnPurchases: preparation.gstOnPurchases, netGst: preparation.netGstPosition,
    returnData: { preparation: { basis: preparation.basis, baseCurrency: 'NZD', calculationFingerprint: preparation.calculation!.fingerprint } },
  }, 201);
  const filed = await f.request<TaxReturnDto>(`/api/tax-returns/${draft.id}/file`, 'POST', { irdReference: 'MYIR-SEP-OCT-2026' });
  return { preparation, filed };
}

function locked(value: { error?: { code?: string; message?: string } }) {
  expect(value.error?.code).toBe('GST_PERIOD_FILED');
  expect(value.error?.message).toMatch(/correction/i);
  expect(value.error?.message).toMatch(/reopen/i);
}

describe('GST date by accounting basis', () => {
  it('uses the date the GST engine places in the return', () => {
    expect(gstLockApplies('invoice', 'sales_document')).toBe(true);
    expect(gstLockApplies('invoice', 'purchase_document')).toBe(true);
    expect(gstLockApplies('invoice', 'customer_settlement')).toBe(false);
    expect(gstLockApplies('invoice', 'supplier_settlement')).toBe(false);
    expect(gstLockApplies('invoice', 'output_gst_journal')).toBe(true);
    expect(gstLockApplies('invoice', 'input_gst_journal')).toBe(true);
    expect(gstLockApplies('payments', 'sales_document')).toBe(false);
    expect(gstLockApplies('payments', 'purchase_document')).toBe(false);
    expect(gstLockApplies('payments', 'customer_settlement')).toBe(true);
    expect(gstLockApplies('payments', 'supplier_settlement')).toBe(true);
    expect(gstLockApplies('payments', 'output_gst_journal')).toBe(false);
    expect(gstLockApplies('payments', 'credit_note')).toBe(true);
    expect(gstLockApplies('payments', 'expense')).toBe(true);
    expect(gstLockApplies('hybrid', 'sales_document')).toBe(true);
    expect(gstLockApplies('hybrid', 'purchase_document')).toBe(false);
    expect(gstLockApplies('hybrid', 'customer_settlement')).toBe(false);
    expect(gstLockApplies('hybrid', 'supplier_settlement')).toBe(true);
    expect(gstLockApplies('hybrid', 'output_gst_journal')).toBe(true);
    expect(gstLockApplies('hybrid', 'input_gst_journal')).toBe(false);
    expect(gstLockApplies('hybrid', 'expense')).toBe(true);
  });
});

describe('filed GST period lock', () => {
  it('rejects an October invoice edit after Sep-Oct is filed and accepts a 3 Nov credit note', async () => withTestDb(async () => {
    const f = await org('invoice');
    try {
      const october = await invoice(f, '2026-10-15');
      const { filed } = await filePeriod(f);
      locked(await f.request(`/api/invoices/${october.id}`, 'PATCH', { notes: 'Adjust the October invoice' }, 409));
      const credit = await f.request<{ id: string; issueDate: string }>('/api/credit-notes', 'POST', {
        invoiceId: october.id, issueDate: '2026-11-03', reason: 'November correction for returned work', taxInclusive: false, taxRate: '15',
        items: [{ description: 'Returned consulting', quantity: '1', rate: '100' }],
      }, 201, { 'Idempotency-Key': crypto.randomUUID() });
      expect(credit.issueDate).toBe('2026-11-03');
      const november = await f.request<GstPreparationResponse>('/api/tax/gst-preparation?from=2026-11-01&to=2026-12-31');
      expect(november.calculation?.sourceIds.creditNotes).toContain(credit.id);
      expect(filed.returnData?.gstCalculation?.fingerprint).toBeTruthy();
    } finally { await f.sql.end(); }
  }));

  it('locks each GST-relevant date for invoice, payments and hybrid basis', async () => withTestDb(async () => {
    for (const basis of ['invoice', 'payments', 'hybrid'] as const) {
      const f = await org(basis);
      try {
        const august = await invoice(f, '2026-08-10');
        const octoberDraft = await invoice(f, '2026-10-15', false);
        await f.request('/api/expenses', 'POST', { description: 'August cost', amount: '115', taxAmount: '15', gstTreatment: 'standard', currency: 'NZD', status: 'approved', expenseDate: '2026-08-12' }, 201);
        const earlyBill = await f.request<{ id: string }>('/api/bills', 'POST', { vendorId: f.vendor.id, issueDate: '2026-08-10', dueDate: '2026-08-31', currency: 'NZD', taxInclusive: true, lines: [{ description: 'August services', quantity: '1', unitPrice: '115', taxRate: '15', accountId: f.expenseAccount.id }] }, 201);
        await f.request(`/api/bills/${earlyBill.id}/receive`, 'POST', {});
        await filePeriod(f);
        const octoberInvoice = await f.request(`/api/invoices/${octoberDraft.id}`, 'PATCH', { notes: 'October draft' }, basis === 'payments' ? 200 : 409);
        if (basis !== 'payments') locked(octoberInvoice);
        const receipt = await f.request('/api/payments', 'POST', { invoiceId: august.id, amount: '115.00', paymentDate: '2026-10-20', paymentMethod: 'bank_transfer' }, basis === 'payments' ? 409 : 201);
        if (basis === 'payments') locked(receipt);
        const supplier = await f.request(`/api/bills/${earlyBill.id}/payments`, 'POST', { bankAccountId: f.bank.id, amount: '23.00', paymentDate: '2026-10-20' }, basis === 'invoice' ? 201 : 409);
        if (basis !== 'invoice') locked(supplier);
        locked(await f.request('/api/expenses', 'POST', { description: 'October cost', amount: '115', taxAmount: '15', gstTreatment: 'standard', currency: 'NZD', status: 'approved', expenseDate: '2026-10-12' }, 409));
        await f.request('/api/expenses', 'POST', { description: 'November cost', amount: '115', taxAmount: '15', gstTreatment: 'standard', currency: 'NZD', status: 'approved', expenseDate: '2026-11-03' }, 201);
        const output = await f.request('/api/journal-entries', 'POST', { description: 'October output GST', entryDate: '2026-10-15', debitAccountId: f.expenseAccount.id, creditAccountId: f.outputGst, amount: '15.00' }, basis === 'payments' ? 201 : 409);
        if (basis !== 'payments') locked(output);
      } finally { await f.sql.end(); }
    }
  }));

  it('rejects create, edit, void and delete of each GST source inside a filed invoice-basis period', async () => withTestDb(async () => {
    const f = await org('invoice');
    try {
      const posted = await invoice(f, '2026-10-15');
      const draft = await invoice(f, '2026-10-16', false);
      const bill = await f.request<{ id: string }>('/api/bills', 'POST', { vendorId: f.vendor.id, issueDate: '2026-10-12', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: true, lines: [{ description: 'October services', quantity: '1', unitPrice: '115', taxRate: '15', accountId: f.expenseAccount.id }] }, 201);
      await f.request(`/api/bills/${bill.id}/receive`, 'POST', {});
      const draftBill = await f.request<{ id: string }>('/api/bills', 'POST', { vendorId: f.vendor.id, issueDate: '2026-10-18', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: true, lines: [{ description: 'Draft bill', quantity: '1', unitPrice: '115', taxRate: '15', accountId: f.expenseAccount.id }] }, 201);
      const expense = await f.request<{ id: string }>('/api/expenses', 'POST', { description: 'October receipt', amount: '115', taxAmount: '15', gstTreatment: 'standard', currency: 'NZD', status: 'approved', expenseDate: '2026-10-09' }, 201);
      await filePeriod(f);
      locked(await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-10-20', dueDate: '2026-10-31', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'Late October invoice', quantity: '1', rate: '100' }] }, 409));
      locked(await f.request(`/api/invoices/${posted.id}`, 'PATCH', { notes: 'Edited filed invoice' }, 409));
      locked(await f.request(`/api/invoices/${posted.id}/cancel`, 'POST', { reason: 'Void the October invoice' }, 409));
      locked(await f.request(`/api/invoices/${draft.id}`, 'DELETE', undefined, 409));
      locked(await f.request(`/api/bills/${bill.id}/void`, 'POST', {}, 409));
      locked(await f.request(`/api/bills/${draftBill.id}`, 'DELETE', undefined, 409));
      locked(await f.request(`/api/expenses/${expense.id}`, 'DELETE', undefined, 409));
      const accounts = await f.request<{ accounts: Array<{ id: string; accountNumber: string | null }> }>('/api/accounts');
      const inputGst = accounts.accounts.find((account) => account.accountNumber === '2150');
      expect(inputGst).toBeTruthy();
      locked(await f.request('/api/journal-entries', 'POST', { description: 'October input GST', entryDate: '2026-10-15', debitAccountId: inputGst!.id, creditAccountId: f.bankLedger, amount: '15.00' }, 409));
      await f.request('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-11-03', dueDate: '2026-11-30', currency: 'NZD', taxInclusive: false, taxRate: '15', items: [{ description: 'November invoice', quantity: '1', rate: '100' }] }, 201);
    } finally { await f.sql.end(); }
  }));

  it('rejects a payments-basis receipt and its reversal inside the filed period', async () => withTestDb(async () => {
    const f = await org('payments');
    try {
      const august = await invoice(f, '2026-08-10');
      const receipt = await f.request<{ id: string }>('/api/payments', 'POST', { invoiceId: august.id, amount: '115.00', paymentDate: '2026-10-20', paymentMethod: 'bank_transfer' }, 201);
      await filePeriod(f);
      locked(await f.request('/api/payments', 'POST', { invoiceId: august.id, amount: '115.00', paymentDate: '2026-10-21', paymentMethod: 'bank_transfer' }, 409));
      locked(await f.request(`/api/payments/${receipt.id}/reverse`, 'POST', { reversalDate: '2026-10-22', reason: 'Reverse October receipt' }, 409));
      await f.request('/api/payments', 'POST', { invoiceId: august.id, amount: '115.00', paymentDate: '2026-11-05', paymentMethod: 'bank_transfer' }, 201);
    } finally { await f.sql.end(); }
  }));

  it('reopens a filed period for an owner, keeps the superseded snapshot, and allows a new filing', async () => withTestDb(async () => {
    const f = await org('invoice');
    try {
      await invoice(f, '2026-10-15');
      const { filed } = await filePeriod(f);
      const snapshot = structuredClone(filed.returnData);
      await f.request(`/api/tax-returns/${filed.id}/reopen`, 'POST', { reason: '   ' }, 400);
      await f.request(`/api/tax-returns/${filed.id}/reopen`, 'POST', { reason: '' }, 400);
      const [membership] = await f.db.select().from(organisationMemberships);
      await f.db.update(organisationMemberships).set({ role: 'accountant' }).where(eq(organisationMemberships.id, membership.id));
      const forbidden = await f.request<{ error: { code: string } }>(`/api/tax-returns/${filed.id}/reopen`, 'POST', { reason: 'Accountant wants the period open' }, 403);
      expect(forbidden.error.code).toBe('FORBIDDEN');
      await f.db.update(organisationMemberships).set({ role: 'member' }).where(eq(organisationMemberships.id, membership.id));
      expect((await f.request<{ error: { code: string } }>(`/api/tax-returns/${filed.id}/reopen`, 'POST', { reason: 'Member wants the period open' }, 403)).error.code).toBe('FORBIDDEN');
      await f.db.update(organisationMemberships).set({ role: 'owner' }).where(eq(organisationMemberships.id, membership.id));
      const reopened = await f.request<TaxReturnDto>(`/api/tax-returns/${filed.id}/reopen`, 'POST', { reason: 'IRD asked us to correct the October invoice' });
      expect(reopened).toMatchObject({ id: filed.id, status: 'submitted', irdReference: 'MYIR-SEP-OCT-2026', reopenReason: 'IRD asked us to correct the October invoice' });
      expect(reopened.supersededAt).toEqual(expect.any(String));
      expect(reopened.returnData).toEqual(snapshot);
      const events = await f.db.select({ action: gstReturnAuditEvents.action, reason: gstReturnAuditEvents.reason, actorId: gstReturnAuditEvents.actorId }).from(gstReturnAuditEvents).where(eq(gstReturnAuditEvents.organisationId, membership.organisationId));
      expect(events).toEqual([{ action: 'reopen', reason: 'IRD asked us to correct the October invoice', actorId: membership.userId }]);
      const overview = await f.request<{ periods: Array<{ periodStart: string; periodEnd: string; status: string }> }>('/api/tax/gst-periods?asOf=2026-11-11');
      expect(overview.periods.find((row) => row.periodStart === period.from && row.periodEnd === period.to)?.status).toBe('reopened');
      await f.request('/api/expenses', 'POST', { description: 'October correction', amount: '115', taxAmount: '15', gstTreatment: 'standard', currency: 'NZD', status: 'approved', expenseDate: '2026-10-22' }, 201);
      const again = await filePeriod(f);
      expect(again.filed.id).not.toBe(filed.id);
      expect(again.filed.status).toBe('submitted');
      expect(again.filed.returnData?.gstCalculation?.fingerprint).not.toBe(snapshot?.gstCalculation?.fingerprint);
      const retained = await f.request<TaxReturnDto>(`/api/tax-returns/${filed.id}`);
      expect(retained.returnData).toEqual(snapshot);
      expect(retained.supersededAt).toBe(reopened.supersededAt);
    } finally { await f.sql.end(); }
  }));
});
