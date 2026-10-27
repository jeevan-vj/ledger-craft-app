import {
  customerSchema,
  errorEnvelopeSchema,
  invoiceSchema,
  paymentListResponseSchema,
  saleResponseSchema,
  salesSummarySchema,
} from '@ledgercraft/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { organisationMemberships } from '../../db/schema/identity';
import { invoices } from '../../db/schema/invoices';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { decimal, roundMoney } from '../invoices/money';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';

function cookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

const originHeaders = {
  Origin: 'http://localhost:8080',
  'Content-Type': 'application/json',
};

function sumMoney(amounts: string[]): string {
  return roundMoney(amounts.reduce((total, amount) => total.add(amount), decimal(0)));
}

function calendarDate(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function signUp(app: ReturnType<typeof createApp>, name: string) {
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID()}@example.com`;
  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: originHeaders,
    body: JSON.stringify({ name, email, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return { cookie: cookieHeader(response) };
}

async function saveProfile(app: ReturnType<typeof createApp>, cookie: string) {
  const response = await app.request('/api/business-profile', {
    method: 'PUT',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      name: 'Market Stall',
      email: 'stall@example.com',
      country: 'NZ',
      defaultTaxRate: '15',
      gstRegistrationStatus: 'registered',
    }),
  });
  expect(response.status).toBe(200);
}

async function ringSale(
  app: ReturnType<typeof createApp>,
  cookie: string,
  key: string,
  body: unknown,
) {
  const response = await app.request('/api/sales', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie, 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return saleResponseSchema.parse(await response.json());
}

async function createCustomer(app: ReturnType<typeof createApp>, cookie: string, name: string) {
  const response = await app.request('/api/customers', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ name, email: `${crypto.randomUUID()}@example.com`, country: 'NZ' }),
  });
  expect(response.status).toBe(201);
  return customerSchema.parse(await response.json());
}

async function createInvoice(
  app: ReturnType<typeof createApp>,
  cookie: string,
  customerId: string,
  date: string,
  description: string,
  rate: string,
) {
  const response = await app.request('/api/invoices', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      customerId,
      date,
      dueDate: date,
      taxInclusive: true,
      items: [{ description, quantity: '1', rate }],
    }),
  });
  expect(response.status).toBe(201);
  return invoiceSchema.parse(await response.json());
}

async function payInvoice(
  app: ReturnType<typeof createApp>,
  cookie: string,
  invoiceId: string,
  amount: string,
  date: string,
  paymentMethod: 'cash' | 'credit_card' | 'bank_transfer',
) {
  const response = await app.request('/api/payments', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ invoiceId, paymentMethod, amount, paymentDate: date }),
  });
  expect(response.status).toBe(201);
}

async function withOwner(
  name: string,
  run: (ctx: {
    app: ReturnType<typeof createApp>;
    db: ReturnType<typeof createDb>['db'];
    owner: { cookie: string };
  }) => Promise<void>,
) {
  await assertLocalDatabaseReachable();
  await withTestDb(async () => {
    const { db, sql } = createDb(getDatabaseUrl());
    try {
      const app = createApp({ auth: createAuth(db), db, checkDatabase: async () => true });
      const owner = await signUp(app, name);
      await saveProfile(app, owner.cookie);
      await run({ app, db, owner });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
}

async function readSummary(app: ReturnType<typeof createApp>, cookie: string, date: string) {
  const response = await app.request(`/api/sales/summary?date=${encodeURIComponent(date)}`, {
    headers: { Cookie: cookie },
  });
  expect(response.status).toBe(200);
  return salesSummarySchema.parse(await response.json());
}

describe('GET /api/sales/summary', () => {
  it('returns an empty day as zero exact decimals', async () => {
    await withOwner('Empty Summary', async ({ app, owner }) => {
      const summary = await readSummary(app, owner.cookie, '1999-12-31');
      expect(summary).toEqual({
        date: '1999-12-31',
        count: 0,
        grossTotal: '0.00',
        gstTotal: '0.00',
        paymentMethods: [],
        topItemsByQuantity: [],
        topItemsByAmount: [],
        sales: [],
      });
    });
  });

  it('counts the sale on the business-timezone calendar day and not the UTC day', async () => {
    await withOwner('Timezone Summary', async ({ app, owner }) => {
      const started = new Date();
      const utcDate = started.toISOString().slice(0, 10);
      const timeZone = ['Pacific/Kiritimati', 'Etc/GMT+12'].find((zone) => calendarDate(zone, started) !== utcDate);
      expect(timeZone).toBeTruthy();
      const settings = await app.request('/api/currency-settings', {
        method: 'PATCH',
        headers: { ...originHeaders, Cookie: owner.cookie },
        body: JSON.stringify({ timezone: timeZone }),
      });
      expect(settings.status).toBe(200);

      const before = new Date();
      const sale = await ringSale(app, owner.cookie, 'summary-tz', {
        lines: [{ label: 'Pie', quantity: '1', price: '4.50' }],
        paymentMethod: 'cash',
      });
      const after = new Date();
      const localDates = [before, after].map((now) => calendarDate(timeZone!, now));
      const utcDates = [before, after].map((now) => now.toISOString().slice(0, 10));
      expect(localDates).toContain(sale.invoice.date);
      expect(utcDates).not.toContain(sale.invoice.date);

      const summary = await readSummary(app, owner.cookie, sale.invoice.date);
      expect(summary.count).toBe(1);
      expect(summary.sales.map((row) => row.invoiceId)).toEqual([sale.invoice.id]);
      expect(summary.grossTotal).toBe(sale.invoice.total);
      for (const utc of utcDates) {
        const other = await readSummary(app, owner.cookie, utc);
        expect(other.sales).toEqual([]);
        expect(other.count).toBe(0);
        expect(other.grossTotal).toBe('0.00');
      }
    });
  });

  it('keeps one organisation’s sales off another organisation’s summary', async () => {
    await withOwner('Summary Org A', async ({ app, owner }) => {
      const other = await signUp(app, 'Summary Org B');
      await saveProfile(app, other.cookie);
      const saleA = await ringSale(app, owner.cookie, 'summary-org-a', {
        lines: [{ label: 'Pie', quantity: '1', price: '4.50' }],
        paymentMethod: 'cash',
      });
      const saleB = await ringSale(app, other.cookie, 'summary-org-b', {
        lines: [{ label: 'Cake', quantity: '1', price: '9.00' }],
        paymentMethod: 'credit_card',
      });

      const summaryA = await readSummary(app, owner.cookie, saleA.invoice.date);
      const summaryB = await readSummary(app, other.cookie, saleB.invoice.date);
      expect(summaryA.sales.map((row) => row.invoiceId)).toEqual([saleA.invoice.id]);
      expect(summaryA.grossTotal).toBe(saleA.invoice.total);
      expect(summaryB.sales.map((row) => row.invoiceId)).toEqual([saleB.invoice.id]);
      expect(summaryB.grossTotal).toBe(saleB.invoice.total);
      expect(summaryA.gstTotal).toBe(saleA.invoice.taxAmount);
      expect(summaryB.gstTotal).toBe(saleB.invoice.taxAmount);

      const leaked = await readSummary(app, owner.cookie, saleB.invoice.date);
      expect(leaked.sales.map((row) => row.invoiceId)).not.toContain(saleB.invoice.id);
      if (saleA.invoice.date !== saleB.invoice.date) expect(leaked.sales).toEqual([]);
    });
  });

  it('includes walk-in and /sales invoices and excludes a normal invoice', async () => {
    await withOwner('Summary Identity', async ({ app, owner }) => {
      const cafe = await createCustomer(app, owner.cookie, 'Stall Cafe');
      const walkInSale = await ringSale(app, owner.cookie, 'summary-walk-in', {
        lines: [{ label: 'Pie', quantity: '1', price: '4.50' }],
        paymentMethod: 'cash',
      });
      const namedSale = await ringSale(app, owner.cookie, 'summary-named', {
        lines: [{ label: 'Cake', quantity: '1', price: '8.00' }],
        paymentMethod: 'credit_card',
        customerId: cafe.id,
      });
      expect(namedSale.invoice.customerId).toBe(cafe.id);
      const day = walkInSale.invoice.date;
      const manualWalkIn = await createInvoice(app, owner.cookie, walkInSale.invoice.customerId, day, 'Counter pie', '2.00');
      await payInvoice(app, owner.cookie, manualWalkIn.id, manualWalkIn.total, day, 'bank_transfer');
      const normal = await createInvoice(app, owner.cookie, cafe.id, day, 'Catering', '20.00');
      await payInvoice(app, owner.cookie, normal.id, normal.total, day, 'cash');
      const unpaid = await createInvoice(app, owner.cookie, walkInSale.invoice.customerId, day, 'Unpaid loaf', '6.00');

      const summary = await readSummary(app, owner.cookie, day);
      const ids = summary.sales.map((row) => row.invoiceId);
      expect(ids).toEqual([walkInSale.invoice.id, namedSale.invoice.id, manualWalkIn.id]);
      expect(ids).not.toContain(normal.id);
      expect(ids).not.toContain(unpaid.id);
      expect(summary.count).toBe(3);
      expect(summary.grossTotal).toBe(sumMoney([
        walkInSale.invoice.total,
        namedSale.invoice.total,
        manualWalkIn.total,
      ]));
      expect(summary.grossTotal).toBe('14.50');
      expect(sumMoney(summary.paymentMethods.map((row) => row.total))).toBe(summary.grossTotal);
      expect(summary.gstTotal).toBe(sumMoney([
        walkInSale.invoice.taxAmount,
        namedSale.invoice.taxAmount,
        manualWalkIn.taxAmount,
      ]));
    });
  });

  it('sums invoice taxAmount and payment methods, and ranks items by quantity and amount', async () => {
    await withOwner('Summary Totals', async ({ app, owner }) => {
      const cash = await ringSale(app, owner.cookie, 'summary-cash', {
        lines: [{ label: 'Pie', quantity: '3', price: '4.50' }],
        paymentMethod: 'cash',
      });
      const card = await ringSale(app, owner.cookie, 'summary-card', {
        lines: [
          { label: 'Cake', quantity: '1', price: '9.00' },
          { label: 'Pie', quantity: '2', price: '4.50' },
        ],
        paymentMethod: 'credit_card',
      });
      const transfer = await ringSale(app, owner.cookie, 'summary-transfer', {
        lines: [{ label: 'Bread', quantity: '1', price: '10.00' }],
        paymentMethod: 'bank_transfer',
      });
      const sales = [cash, card, transfer];
      const roundedLineTax = sumMoney(sales.flatMap((sale) => sale.invoice.items.map((line) => line.tax ?? '0.00')));
      const invoiceTax = sumMoney(sales.map((sale) => sale.invoice.taxAmount));
      expect(card.invoice.taxAmount).toBe('2.35');
      expect(roundedLineTax).not.toBe(invoiceTax);

      const summary = await readSummary(app, owner.cookie, cash.invoice.date);
      expect(summary.count).toBe(3);
      expect(summary.grossTotal).toBe('41.50');
      expect(summary.gstTotal).toBe(invoiceTax);
      expect(summary.gstTotal).not.toBe(roundedLineTax);
      expect(summary.paymentMethods).toEqual([
        { paymentMethod: 'cash', total: '13.50' },
        { paymentMethod: 'credit_card', total: '18.00' },
        { paymentMethod: 'bank_transfer', total: '10.00' },
      ]);
      expect(sumMoney(summary.paymentMethods.map((row) => row.total))).toBe(summary.grossTotal);
      expect(summary.topItemsByQuantity).toEqual([
        { description: 'Pie', quantity: '5.00', amount: '22.50' },
        { description: 'Bread', quantity: '1.00', amount: '10.00' },
        { description: 'Cake', quantity: '1.00', amount: '9.00' },
      ]);
      expect(summary.topItemsByAmount).toEqual([
        { description: 'Pie', quantity: '5.00', amount: '22.50' },
        { description: 'Bread', quantity: '1.00', amount: '10.00' },
        { description: 'Cake', quantity: '1.00', amount: '9.00' },
      ]);
      expect(summary.sales.map((row) => row.invoiceId)).toEqual(sales.map((sale) => sale.invoice.id));
    });
  });

  it('splits one settled invoice across two payment methods', async () => {
    await withOwner('Summary Split', async ({ app, owner }) => {
      const seed = await ringSale(app, owner.cookie, 'summary-split-seed', {
        lines: [{ label: 'Pie', quantity: '1', price: '4.50' }],
        paymentMethod: 'cash',
      });
      const day = seed.invoice.date;
      const split = await createInvoice(app, owner.cookie, seed.invoice.customerId, day, 'Split loaf', '10.00');
      await payInvoice(app, owner.cookie, split.id, '4.00', day, 'cash');
      await payInvoice(app, owner.cookie, split.id, '6.00', day, 'credit_card');

      const summary = await readSummary(app, owner.cookie, day);
      expect(summary.sales.map((row) => row.invoiceId)).toEqual([seed.invoice.id, split.id]);
      expect(summary.count).toBe(2);
      expect(summary.grossTotal).toBe(sumMoney([seed.invoice.total, split.total]));
      expect(summary.paymentMethods).toEqual([
        { paymentMethod: 'cash', total: '8.50' },
        { paymentMethod: 'credit_card', total: '6.00' },
      ]);
      expect(sumMoney(summary.paymentMethods.map((row) => row.total))).toBe(summary.grossTotal);
    });
  });

  it('omits a cancelled sale even when its payment row stays completed', async () => {
    await withOwner('Summary Cancelled', async ({ app, db, owner }) => {
      const sale = await ringSale(app, owner.cookie, 'summary-cancelled', {
        lines: [{ label: 'Pie', quantity: '1', price: '4.50' }],
        paymentMethod: 'cash',
      });
      await db.update(invoices).set({ lifecycleStatus: 'cancelled' }).where(eq(invoices.id, sale.invoice.id));

      const payments = paymentListResponseSchema.parse(await (await app.request('/api/payments', {
        headers: { Cookie: owner.cookie },
      })).json());
      expect(payments.payments).toEqual([
        expect.objectContaining({ invoiceId: sale.invoice.id, status: 'completed', amount: sale.invoice.total }),
      ]);
      const summary = await readSummary(app, owner.cookie, sale.invoice.date);
      expect(summary.sales).toEqual([]);
      expect(summary.count).toBe(0);
      expect(summary.grossTotal).toBe('0.00');
      expect(summary.paymentMethods).toEqual([]);
    });
  });

  it('rejects a missing or invalid date', async () => {
    await withOwner('Summary Date', async ({ app, owner }) => {
      const headers = { Cookie: owner.cookie };
      const missing = await app.request('/api/sales/summary', { headers });
      expect(missing.status).toBe(400);
      expect(errorEnvelopeSchema.parse(await missing.json()).error.code).toBe('VALIDATION_ERROR');
      for (const date of ['2026-02-31', '27-10-2026', '2026-1-1', 'yesterday']) {
        const response = await app.request(`/api/sales/summary?date=${encodeURIComponent(date)}`, { headers });
        expect(response.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  it('allows invoice read and rejects a role without invoices.read', async () => {
    const anonymous = await createApp().request('/api/sales/summary?date=2026-10-27');
    expect(anonymous.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await anonymous.json()).error.code).toBe('UNAUTHORIZED');

    await withOwner('Summary Permission', async ({ app, db, owner }) => {
      const allowed = await readSummary(app, owner.cookie, '1999-12-31');
      expect(allowed.count).toBe(0);

      const session = await createAuth(db).api.getSession({ headers: new Headers({ Cookie: owner.cookie }) });
      await db.update(organisationMemberships).set({ role: 'read_only' })
        .where(eq(organisationMemberships.userId, session!.user.id));
      const readable = await readSummary(app, owner.cookie, '1999-12-31');
      expect(readable.count).toBe(0);

      await db.update(organisationMemberships).set({ role: 'billing' })
        .where(eq(organisationMemberships.userId, session!.user.id));
      const denied = await app.request('/api/sales/summary?date=1999-12-31', { headers: { Cookie: owner.cookie } });
      expect(denied.status).toBe(403);
      const error = errorEnvelopeSchema.parse(await denied.json()).error;
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toContain('invoices.read');
    });
  });
});
