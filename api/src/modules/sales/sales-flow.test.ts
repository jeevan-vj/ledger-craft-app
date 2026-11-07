import {
  paymentReceiptListResponseSchema,
  publicSharedInvoiceSchema,
  saleResponseSchema,
  salesSummarySchema,
  shareInvoiceResponseSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { withTestDb } from '../../test/harness';
import { createAuth } from '../auth/auth';

describe('quick sale receipt and daily takings flow', () => {
  it('publishes a paid invoice after a replay and removes reversed payments from daily takings', async () => {
    await withTestDb(async ({ db }) => {
      const app = createApp({ auth: createAuth(db), db });
      const jsonHeaders = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };
      const signup = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: 'Stall seller', email: `${crypto.randomUUID()}@example.test`, password: 'password123' }),
      });
      expect(signup.status).toBe(200);
      const cookie = signup.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
      const headers = { ...jsonHeaders, Cookie: cookie };
      const profile = await app.request('/api/business-profile', {
        method: 'PUT', headers,
        body: JSON.stringify({ name: 'Market Stall', email: 'stall@example.test', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2020-01-01' }),
      });
      expect(profile.status).toBe(200);

      const body = JSON.stringify({ lines: [{ label: 'Pie', quantity: '3', price: '4.50' }], paymentMethod: 'cash' });
      const request = () => app.request('/api/sales', {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': 'receipt-flow' }, body,
      });
      const first = await request();
      expect(first.status).toBe(201);
      const sale = saleResponseSchema.parse(await first.json());
      const retry = await request();
      expect(retry.status).toBe(201);
      expect(saleResponseSchema.parse(await retry.json())).toEqual(sale);

      const receipts = await app.request(`/api/receipts?invoiceId=${sale.invoice.id}`, { headers });
      expect(receipts.status).toBe(200);
      expect(paymentReceiptListResponseSchema.parse(await receipts.json()).receipts).toEqual([sale.receipt]);
      expect(sale.receipt.receiptData.customerEmail).toBeNull();

      const shared = await app.request(`/api/invoices/${sale.invoice.id}/share`, {
        method: 'POST', headers, body: JSON.stringify({ templateName: 'classic' }),
      });
      expect(shared.status).toBe(201);
      const share = shareInvoiceResponseSchema.parse(await shared.json());
      // A buyer scanning the link is anonymous: no seller session is passed.
      const publicResponse = await app.request(`/api/public/invoices/${share.shareToken}`);
      expect(publicResponse.status).toBe(200);
      const snapshot = publicSharedInvoiceSchema.parse(await publicResponse.json());
      expect(snapshot.invoice).toMatchObject({
        id: sale.invoice.id, status: 'paid', paymentStatus: 'paid', total: '13.50', totalPaid: '13.50', balanceDue: '0.00', taxAmount: '1.76',
      });
      expect(snapshot.invoice.items).toEqual(sale.invoice.items);

      const summaryRequest = () => app.request(`/api/sales/summary?date=${sale.invoice.date}`, { headers });
      const summaryResponse = await summaryRequest();
      expect(summaryResponse.status).toBe(200);
      expect(salesSummarySchema.parse(await summaryResponse.json())).toMatchObject({
        count: 1, grossTotal: '13.50', gstTotal: '1.76',
        paymentMethods: [{ paymentMethod: 'cash', total: '13.50' }],
        sales: [{ invoiceId: sale.invoice.id, invoiceNumber: sale.invoice.invoiceNumber, total: '13.50', taxAmount: '1.76' }],
      });

      // Reversal belongs to the existing invoice workflow, not POS v1. Its
      // accounting state still has to be honoured by the read-only summary.
      const reversed = await app.request(`/api/payments/${sale.payment.id}/reverse`, {
        method: 'POST', headers,
        body: JSON.stringify({ reason: 'Recorded against the wrong customer', reversalDate: sale.payment.paymentDate }),
      });
      expect(reversed.status).toBe(200);
      const afterReversal = await summaryRequest();
      expect(afterReversal.status).toBe(200);
      expect(salesSummarySchema.parse(await afterReversal.json())).toEqual({
        date: sale.invoice.date, count: 0, grossTotal: '0.00', gstTotal: '0.00',
        paymentMethods: [], topItemsByQuantity: [], topItemsByAmount: [], sales: [],
      });
    });
  });
});
