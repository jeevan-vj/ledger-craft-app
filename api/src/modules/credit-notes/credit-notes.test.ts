import { creditNoteSchema, invoiceSchema, financialReportResponseSchema, currencySettingsSchema } from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

type App = ReturnType<typeof createApp>;
const origin = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
async function json(app: App, headers: Record<string, string>, path: string, body?: unknown, status = 201, method = 'POST') {
  const response = await app.request(path, { headers, method: body === undefined ? 'GET' : method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json() as Record<string, unknown>;
  expect(response.status, JSON.stringify(value)).toBe(status); return value;
}
async function signup(app: App) {
  const response = await app.request('/api/auth/sign-up/email', { method: 'POST', headers: origin, body: JSON.stringify({ name: 'Credit Accountant', email: `credit-${crypto.randomUUID()}@example.test`, password: 'Local-credit-note-2026!' }) });
  expect(response.status).toBe(200);
  return { ...origin, Cookie: response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') };
}
async function scenario(run: (app: App, headers: Record<string, string>, invoiceId: string, bankId: string) => Promise<void>) {
  await withTestDb(async () => {
    const { db, sql } = createDb(getDatabaseUrl());
    try {
      const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true }); const headers = await signup(app);
      await json(app, headers, '/api/business-profile', { name: 'Credit Reference Limited', email: 'owner@credit.example.test', country: 'NZ', gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2020-01-01', defaultTaxRate: '15' }, 200, 'PUT');
      const customer = await json(app, headers, '/api/customers', { name: 'Harbour Cafe', email: 'accounts@harbour.example.test' });
      const invoice = invoiceSchema.parse(await json(app, headers, '/api/invoices', { customerId: customer.id, date: '2026-04-01', dueDate: '2026-04-30', taxInclusive: false, taxRate: '15', currency: 'NZD', items: [{ description: 'Consulting', quantity: '1', rate: '1000' }] }));
      await json(app, headers, `/api/invoices/${invoice.id}`, { status: 'sent' }, 200, 'PATCH');
      const bank = await json(app, headers, '/api/bank-accounts', { accountName: 'Operating', accountNumber: '123', bankName: 'Test Bank', accountType: 'checking' });
      await run(app, headers, invoice.id, String(bank.id));
    } finally { await sql.end(); }
  });
}
const note = (invoiceId: string, rate = '200') => ({ invoiceId, issueDate: '2026-04-10', reason: 'Agreed consulting service reduction', taxInclusive: false, taxRate: '15', items: [{ description: 'Consulting credit', quantity: '1', rate }] });
const report = async (app: App, headers: Record<string, string>) => financialReportResponseSchema.parse(await json(app, headers, '/api/reports/financial?from=2026-04-01&to=2026-04-30&basis=accrual&baseCurrency=NZD', undefined, 200));
const accountBalance = (value: Awaited<ReturnType<typeof report>>, number: string) => value.trialBalance.rows.find(row => row.accountNumber === number)?.balance ?? '0.00';

describe('credit note accounting lifecycle', () => {
  it('credits unpaid1150 by230 to AR920/revenue800/GST120, replays once, and settles remaining920 without changing original total', async () => {
    await scenario(async (app, headers, invoiceId) => {
      const issueHeaders = { ...headers, 'Idempotency-Key': crypto.randomUUID() };
      const credit = creditNoteSchema.parse(await json(app, issueHeaders, '/api/credit-notes', note(invoiceId)));
      expect(credit).toMatchObject({ total: '230.00', taxAmount: '30.00', receivableAmount: '230.00', customerCreditAmount: '0.00' });
      expect(creditNoteSchema.parse(await json(app, issueHeaders, '/api/credit-notes', note(invoiceId))).id).toBe(credit.id);
      expect(invoiceSchema.parse(await json(app, headers, `/api/invoices/${invoiceId}`, undefined, 200))).toMatchObject({ total: '1150.00', totalCredited: '230.00', balanceDue: '920.00' });
      const books = await report(app, headers);
      expect(books.profitLoss).toMatchObject({ revenue: '800.00', netIncome: '800.00' }); expect(books.taxSummary.outputGst).toBe('120.00'); expect(accountBalance(books, '1200')).toBe('920.00'); expect(books.cashFlow.closingCash).toBe('0.00'); expect(books.balanceSheet.balanced).toBe(true);
      const payment = await json(app, headers, '/api/payments', { invoiceId, amount: '920.00', paymentDate: '2026-04-15', paymentMethod: 'bank_transfer' });
      expect(invoiceSchema.parse(await json(app, headers, `/api/invoices/${invoiceId}`, undefined, 200))).toMatchObject({ status: 'paid', totalPaid: '920.00', balanceDue: '0.00', total: '1150.00' });
      expect(accountBalance(await report(app, headers), '1200')).toBe('0.00');
      await json(app, headers, `/api/payments/${payment.id}/reverse`, { reversalDate: '2026-04-20', reason: 'Must reverse credit notes first' }, 409);
      await json(app, headers, `/api/invoices/${invoiceId}/cancel`, { reason: 'Must reverse credit notes first' }, 409);
      const gst = await json(app, headers, '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30', undefined, 200);
      expect(gst).toMatchObject({ totalSales: '920.00', gstOnSales: '120.00' });
    });
  });
  it('credits a paid invoice to customer liability, refunds230 once, and reverses refund/note with balanced original history', async () => {
    await scenario(async (app, headers, invoiceId, bankId) => {
      await json(app, headers, '/api/payments', { invoiceId, amount: '1150.00', paymentDate: '2026-04-05', paymentMethod: 'bank_transfer' });
      const credit = creditNoteSchema.parse(await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, '/api/credit-notes', note(invoiceId)));
      expect(credit).toMatchObject({ receivableAmount: '0.00', customerCreditAmount: '230.00', refundAvailable: '230.00' });
      const before = await report(app, headers); expect(accountBalance(before, '2300')).toBe('230.00'); expect(accountBalance(before, '1200')).toBe('0.00'); expect(before.cashFlow.closingCash).toBe('1150.00'); expect(before.balanceSheet.balanced).toBe(true);
      await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, `/api/credit-notes/${credit.id}/refunds`, { amount: '231.00', refundDate: '2026-04-15', bankAccountId: bankId }, 400);
      await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, `/api/credit-notes/${credit.id}/refunds`, { amount: '230.00', refundDate: '2026-04-09', bankAccountId: bankId }, 400);
      const refundHeaders = { ...headers, 'Idempotency-Key': crypto.randomUUID() }; const input = { amount: '230.00', refundDate: '2026-04-15', bankAccountId: bankId };
      const refunded = creditNoteSchema.parse(await json(app, refundHeaders, `/api/credit-notes/${credit.id}/refunds`, input));
      expect(refunded).toMatchObject({ refundedAmount: '230.00', refundAvailable: '0.00' });
      expect(creditNoteSchema.parse(await json(app, refundHeaders, `/api/credit-notes/${credit.id}/refunds`, input)).refunds).toHaveLength(1);
      const after = await report(app, headers); expect(accountBalance(after, '2300')).toBe('0.00'); expect(after.cashFlow.closingCash).toBe('920.00'); expect(after.balanceSheet.balanced).toBe(true);
      expect(await json(app, headers, '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30&basis=payments', undefined, 200)).toMatchObject({ totalSales: '920.00', gstOnSales: '120.00' });
      await json(app, headers, `/api/credit-notes/${credit.id}/reverse`, { date: '2026-04-20', reason: 'Cannot reverse a refunded credit note' }, 409);
      const refund = refunded.refunds[0];
      await json(app, headers, `/api/credit-notes/${credit.id}/refunds/${refund.id}/reverse`, { date: '2026-04-20', reason: 'Customer refund was returned' }, 200);
      const reversed = creditNoteSchema.parse(await json(app, headers, `/api/credit-notes/${credit.id}/reverse`, { date: '2026-04-21', reason: 'Original credit agreement withdrawn' }, 200));
      expect(reversed.status).toBe('reversed');
      expect(creditNoteSchema.parse(await json(app, headers, `/api/credit-notes/${credit.id}/reverse`, { date: '2026-04-21', reason: 'Original credit agreement withdrawn' }, 200)).status).toBe('reversed');
      const restored = await report(app, headers); expect(restored.profitLoss.revenue).toBe('1000.00'); expect(restored.taxSummary.outputGst).toBe('150.00'); expect(accountBalance(restored, '2300')).toBe('0.00'); expect(restored.cashFlow.closingCash).toBe('1150.00'); expect(restored.balanceSheet.balanced).toBe(true);
    });
  });
  it('conserves the original foreign base cents across three credits and mixed cash/credit settlement', async () => {
    await scenario(async (app, headers, originalId) => {
      const original = invoiceSchema.parse(await json(app, headers, `/api/invoices/${originalId}`, undefined, 200));
      await json(app, headers, '/api/exchange-rates', { currencyCode: 'USD', effectiveDate: '2026-04-01', rate: '1.50000' });
      const create = async () => {
        const invoice = invoiceSchema.parse(await json(app, headers, '/api/invoices', { customerId: original.customerId, date: '2026-04-02', dueDate: '2026-04-30', currency: 'USD', taxInclusive: false, taxRate: '0', items: [{ description: 'Small USD service', quantity: '1', rate: '0.03' }] }));
        return invoiceSchema.parse(await json(app, headers, `/api/invoices/${invoice.id}`, { status: 'sent' }, 200, 'PATCH'));
      };
      const invoice = await create();
      const credits = [];
      for (let index = 0; index < 3; index++) credits.push(creditNoteSchema.parse(await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, '/api/credit-notes', { ...note(invoice.id, '0.01'), taxRate: '0' })));
      expect(credits.map(credit => credit.baseTotal)).toEqual(['0.02', '0.01', '0.02']);
      expect(invoiceSchema.parse(await json(app, headers, `/api/invoices/${invoice.id}`, undefined, 200))).toMatchObject({ total: '0.03', totalCredited: '0.03', baseCredited: '0.05', balanceDue: '0.00' });
      const mixed = await create();
      await json(app, headers, '/api/payments', { invoiceId: mixed.id, amount: '0.01', paymentDate: '2026-04-05', paymentMethod: 'bank_transfer' });
      await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, '/api/credit-notes', { ...note(mixed.id, '0.01'), taxRate: '0' });
      await json(app, headers, '/api/payments', { invoiceId: mixed.id, amount: '0.01', paymentDate: '2026-04-15', paymentMethod: 'bank_transfer' });
      expect(invoiceSchema.parse(await json(app, headers, `/api/invoices/${mixed.id}`, undefined, 200))).toMatchObject({ balanceDue: '0.00', status: 'paid' });
      const books = await report(app, headers); expect(accountBalance(books, '1200')).toBe('1150.00'); expect(books.balanceSheet.balanced).toBe(true);
    });
  });
  it('conserves the original GST cent when a proportional credit consumes the rounded tax before the final receipt', async () => {
    await scenario(async (app, headers, originalId) => {
      const original = invoiceSchema.parse(await json(app, headers, `/api/invoices/${originalId}`, undefined, 200));
      const invoice = invoiceSchema.parse(await json(app, headers, '/api/invoices', { customerId: original.customerId, date: '2026-04-02', dueDate: '2026-04-30', currency: 'NZD', taxInclusive: true, taxRate: '15', items: [{ description: 'Small service', quantity: '1', rate: '0.10' }] }));
      await json(app, headers, `/api/invoices/${invoice.id}`, { status: 'sent' }, 200, 'PATCH');
      const credit = creditNoteSchema.parse(await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, '/api/credit-notes', { ...note(invoice.id, '0.05'), taxInclusive: true }));
      expect(credit).toMatchObject({ total: '0.05', taxAmount: '0.01', receivableAmount: '0.05' });
      await json(app, headers, '/api/payments', { invoiceId: invoice.id, amount: '0.05', paymentDate: '2026-04-15', paymentMethod: 'bank_transfer' });
      expect(await json(app, headers, '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30&basis=payments', undefined, 200)).toMatchObject({ totalSales: '0.05', gstOnSales: '0.00' });
    });
  });
  it('refunds foreign customer credit at a reviewed settlement rate, posts FX loss and locks the refund-only rate', async () => {
    await scenario(async (app, headers, originalId, bankId) => {
      const original = invoiceSchema.parse(await json(app, headers, `/api/invoices/${originalId}`, undefined, 200));
      await json(app, headers, '/api/exchange-rates', { currencyCode: 'USD', effectiveDate: '2026-04-01', rate: '1.60000' });
      const invoice = invoiceSchema.parse(await json(app, headers, '/api/invoices', { customerId: original.customerId, date: '2026-04-02', dueDate: '2026-04-30', currency: 'USD', taxInclusive: false, taxRate: '15', items: [{ description: 'USD consulting', quantity: '1', rate: '100' }] }));
      await json(app, headers, '/api/payments', { invoiceId: invoice.id, amount: '115.00', paymentDate: '2026-04-05', paymentMethod: 'bank_transfer' });
      const credit = creditNoteSchema.parse(await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, '/api/credit-notes', note(invoice.id, '20')));
      expect(credit).toMatchObject({ total: '23.00', baseTotal: '36.80', baseTaxAmount: '4.80', customerCreditAmount: '23.00', baseCustomerCreditAmount: '36.80' });
      const rate = currencySettingsSchema.parse(await json(app, headers, '/api/exchange-rates', { currencyCode: 'USD', effectiveDate: '2026-04-15', rate: '1.75000' })).rates.find(row => row.effectiveDate === '2026-04-15')!;
      const refunded = creditNoteSchema.parse(await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, `/api/credit-notes/${credit.id}/refunds`, { amount: '23.00', refundDate: '2026-04-15', bankAccountId: bankId, exchangeRateId: rate.id }));
      expect(refunded.refunds[0]).toMatchObject({ baseAmount: '40.25', bookBaseAmount: '36.80', exchangeDifference: '3.45' });
      const books = await report(app, headers); expect(accountBalance(books, '2300')).toBe('0.00'); expect(accountBalance(books, '5200')).toBe('3.45'); expect(books.cashFlow.closingCash).toBe('143.75'); expect(books.balanceSheet.balanced).toBe(true);
      expect(await json(app, headers, '/api/tax/gst-preparation?from=2026-04-01&to=2026-04-30&basis=payments', undefined, 200)).toMatchObject({ totalSales: '147.20', gstOnSales: '19.20', requiresReview: true });
      const deletion = await app.request(`/api/exchange-rates/${rate.id}`, { method: 'DELETE', headers }); expect(deletion.status).toBe(409);
    });
  });
  it('rejects a misclassified customer-credit control account instead of posting a liability into assets', async () => {
    await scenario(async (app, headers, invoiceId) => {
      await json(app, headers, '/api/accounts', { name: 'Incorrect customer-credit account', type: 'asset', accountClass: 'asset', accountNumber: '2300' });
      await json(app, headers, '/api/payments', { invoiceId, amount: '1150.00', paymentDate: '2026-04-05', paymentMethod: 'bank_transfer' });
      await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, '/api/credit-notes', note(invoiceId), 409);
    });
  });
  it('rejects excess/unsupported credits, missing idempotency and another company access', async () => {
    await scenario(async (app, headers, invoiceId) => {
      const keyed = { ...headers, 'Idempotency-Key': crypto.randomUUID() };
      const source = invoiceSchema.parse(await json(app, headers, `/api/invoices/${invoiceId}`, undefined, 200));
      const draft = invoiceSchema.parse(await json(app, headers, '/api/invoices', { customerId: source.customerId, date: '2026-04-01', dueDate: '2026-04-30', taxInclusive: false, taxRate: '15', items: [{ description: 'Unissued work', quantity: '1', rate: '100' }] }));
      await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, '/api/credit-notes', note(draft.id, '20'), 409);
      await json(app, headers, '/api/credit-notes', note(invoiceId), 400);
      await json(app, keyed, '/api/credit-notes', note(invoiceId, '1100'), 400);
      await json(app, { ...headers, 'Idempotency-Key': crypto.randomUUID() }, '/api/credit-notes', { ...note(invoiceId), taxRate: '0' }, 400);
      const credit = creditNoteSchema.parse(await json(app, keyed, '/api/credit-notes', note(invoiceId)));
      await json(app, keyed, '/api/credit-notes', note(invoiceId, '100'), 409);
      const other = await signup(app);
      await json(app, other, `/api/credit-notes/${credit.id}`, undefined, 404);
      expect(await json(app, other, '/api/credit-notes', undefined, 200)).toEqual({ creditNotes: [] });
      await json(app, { ...other, 'Idempotency-Key': crypto.randomUUID() }, '/api/credit-notes', note(invoiceId), 404);
      const concurrent = await Promise.all([0, 1].map(() => app.request('/api/credit-notes', { method: 'POST', headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(note(invoiceId, '500')) })));
      expect(concurrent.map(response => response.status).sort()).toEqual([201, 400]);
      expect(invoiceSchema.parse(await json(app, headers, `/api/invoices/${invoiceId}`, undefined, 200))).toMatchObject({ totalCredited: '805.00', balanceDue: '345.00' });
      expect((await app.request('/api/credit-notes')).status).toBe(401);
    });
  });
});
