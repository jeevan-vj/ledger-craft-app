import {
  invoiceSchema,
  paymentSchema,
  taxReturnSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

function cookieHeader(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

const originHeaders = {
  Origin: 'http://localhost:8080',
  'Content-Type': 'application/json',
};

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`;
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: originHeaders,
    body: JSON.stringify({ name, email, password: 'Local-gst-test-123!' }),
  });
  expect(response.status).toBeLessThan(400);
  return { cookie: cookieHeader(response) };
}

describe('new business GST self-filing journey', () => {
  it('creates a GST invoice, receives payment, saves IRD figures, and records myIR filing', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Kauri Design Owner');
        const outsider = await signUp(app, 'Other Business Owner');
        const headers = { ...originHeaders, Cookie: owner.cookie };

        const profile = await app.request('/api/business-profile', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name: 'Kauri Design Limited',
            email: 'owner@kauridesign.example',
            country: 'NZ',
            defaultTaxRate: '15',
            gstRegistrationStatus: 'registered',
            invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
            invoiceNumberSequence: 1,
          }),
        });
        expect(profile.status).toBe(200);

        const customerResponse = await app.request('/api/customers', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: 'Harbour Cafe',
            email: 'accounts@harbourcafe.example',
            country: 'NZ',
          }),
        });
        expect(customerResponse.status).toBe(201);
        const customer = (await customerResponse.json()) as { id: string };

        const invoiceResponse = await app.request('/api/invoices', {
          method: 'POST',
          headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({
            customerId: customer.id,
            date: '2026-07-15',
            dueDate: '2026-08-14',
            currency: 'NZD',
            taxInclusive: false,
            taxRate: '15',
            items: [{ description: 'Brand identity package', quantity: '1', rate: '1000.00' }],
          }),
        });
        expect(invoiceResponse.status).toBe(201);
        const invoice = invoiceSchema.parse(await invoiceResponse.json());
        expect(invoice.subtotal).toBe('1000.00');
        expect(invoice.taxAmount).toBe('150.00');
        expect(invoice.total).toBe('1150.00');
        expect(invoice.paymentStatus).toBe('unpaid');

        const paymentResponse = await app.request('/api/payments', {
          method: 'POST',
          headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({
            invoiceId: invoice.id,
            paymentMethod: 'bank_transfer',
            amount: '1150.00',
            paymentDate: '2026-08-01',
            referenceNumber: 'BANK-2026-08-01-001',
          }),
        });
        expect(paymentResponse.status).toBe(201);
        expect(paymentSchema.parse(await paymentResponse.json()).amount).toBe('1150.00');

        const paidInvoice = invoiceSchema.parse(
          await (await app.request(`/api/invoices/${invoice.id}`, { headers })).json(),
        );
        expect(paidInvoice.paymentStatus).toBe('paid');
        expect(paidInvoice.balanceDue).toBe('0.00');

        // The invoice use case is the authoritative source of the exact GST figures.
        // This journey records those values in the IRD preparation snapshot.
        const returnResponse = await app.request('/api/tax-returns', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            periodStart: '2026-07-01',
            periodEnd: '2026-09-30',
            returnType: 'GST',
            totalSales: paidInvoice.total,
            totalPurchases: '0.00',
            gstOnSales: paidInvoice.taxAmount,
            gstOnPurchases: '0.00',
            netGst: paidInvoice.taxAmount,
            returnData: {
              gstReturn: {
                salesDetails: {
                  standardRated: 1150,
                  zeroRated: 0,
                  exempt: 0,
                  totalSales: 1150,
                  gstOnSales: 150,
                },
                purchaseDetails: {
                  standardRated: 0,
                  capitalGoods: 0,
                  totalPurchases: 0,
                  gstOnPurchases: 0,
                },
                adjustments: { badDebts: 0, otherAdjustments: 0 },
              },
              reconciliation: {
                status: 'not_applicable',
                unreconciledTransactionCount: 0,
                figuresMatch: true,
                accounts: [],
                issues: [],
              },
            },
          }),
        });
        expect(returnResponse.status).toBe(201);
        const draft = taxReturnSchema.parse(await returnResponse.json());
        expect(draft.status).toBe('draft');
        expect(draft.totalSales).toBe('1150.00');
        expect(draft.gstOnSales).toBe('150.00');
        expect(draft.netGst).toBe('150.00');

        const filedResponse = await app.request(`/api/tax-returns/${draft.id}/file`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ irdReference: 'MYIR-GST-Q3-2026-001' }),
        });
        expect(filedResponse.status).toBe(200);
        const filed = taxReturnSchema.parse(await filedResponse.json());
        expect(filed.status).toBe('submitted');
        expect(filed.irdReference).toBe('MYIR-GST-Q3-2026-001');
        expect(filed.submittedAt).not.toBeNull();

        const reloaded = taxReturnSchema.parse(
          await (await app.request(`/api/tax-returns/${draft.id}`, { headers })).json(),
        );
        expect(reloaded).toMatchObject({
          status: 'submitted',
          totalSales: '1150.00',
          gstOnSales: '150.00',
          netGst: '150.00',
          irdReference: 'MYIR-GST-Q3-2026-001',
        });

        const crossOrganisationRead = await app.request(`/api/tax-returns/${draft.id}`, {
          headers: { Cookie: outsider.cookie },
        });
        expect(crossOrganisationRead.status).toBe(404);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
