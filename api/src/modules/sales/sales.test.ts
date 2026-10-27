import {
  customerListResponseSchema,
  errorEnvelopeSchema,
  invoiceListResponseSchema,
  itemSchema,
  paymentListResponseSchema,
  paymentReceiptListResponseSchema,
  saleResponseSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { decimal } from '../invoices/money';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';
import { businessDate } from './sales.service';

describe('businessDate', () => {
  it('uses the business timezone when that calendar day differs from UTC', () => {
    const now = new Date('2026-10-27T10:30:00.000Z');
    expect(businessDate('Pacific/Niue', now)).toBe('2026-10-26');
    expect(businessDate('UTC', now)).toBe('2026-10-27');
    expect(businessDate('Pacific/Auckland', now)).toBe('2026-10-27');
  });
});

function cookieHeader(response: Response): string {
  const cookies = response.headers.getSetCookie();
  return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
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
    body: JSON.stringify({ name, email, password: 'password123' }),
  });
  expect(response.status).toBeLessThan(400);
  return { cookie: cookieHeader(response) };
}

async function saveProfile(
  app: ReturnType<typeof createApp>,
  cookie: string,
  extra: Record<string, string> = {},
) {
  const response = await app.request('/api/business-profile', {
    method: 'PUT',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      name: 'Market Stall',
      email: 'stall@example.com',
      country: 'NZ',
      defaultTaxRate: '15',
      gstRegistrationStatus: 'registered',
      ...extra,
    }),
  });
  expect(response.status).toBe(200);
}

async function createItem(
  app: ReturnType<typeof createApp>,
  cookie: string,
  input: { name: string; salePrice: string; taxRate?: string | null; isActive?: boolean },
) {
  const response = await app.request('/api/items', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      name: input.name,
      type: 'product',
      salePrice: input.salePrice,
      taxRate: input.taxRate,
      unit: 'ea',
      isActive: input.isActive ?? true,
    }),
  });
  expect(response.status).toBe(201);
  return itemSchema.parse(await response.json());
}

function saleHeaders(cookie: string, key: string) {
  return { ...originHeaders, Cookie: cookie, 'Idempotency-Key': key };
}

async function postSale(
  app: ReturnType<typeof createApp>,
  cookie: string,
  key: string,
  body: unknown,
) {
  return app.request('/api/sales', {
    method: 'POST',
    headers: saleHeaders(cookie, key),
    body: JSON.stringify(body),
  });
}

describe('sale routes', () => {
  it('unauthenticated POST /api/sales returns 401', async () => {
    const response = await createApp().request('/api/sales', {
      method: 'POST',
      headers: { ...originHeaders, 'Idempotency-Key': 'sale-anon' },
      body: JSON.stringify({ lines: [{ quantity: '1', price: '4.50' }], paymentMethod: 'cash' }),
    });
    expect(response.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('requires an Idempotency-Key and replays or conflicts on that key', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Sale Idempotent');
        const other = await signUp(app, 'Sale Idempotent Other');
        await saveProfile(app, owner.cookie);
        await saveProfile(app, other.cookie);
        const body = { lines: [{ quantity: '3', price: '4.50' }], paymentMethod: 'cash' };
        const missing = await app.request('/api/sales', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify(body),
        });
        expect(missing.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await missing.json()).error.code).toBe('VALIDATION_ERROR');
        const blank = await app.request('/api/sales', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie, 'Idempotency-Key': '   ' },
          body: JSON.stringify(body),
        });
        expect(blank.status).toBe(400);

        const first = await postSale(app, owner.cookie, 'sale-retry-1', body);
        expect(first.status).toBe(201);
        const original = saleResponseSchema.parse(await first.json());
        const replay = await postSale(app, owner.cookie, 'sale-retry-1', body);
        expect(replay.status).toBe(201);
        expect(saleResponseSchema.parse(await replay.json())).toEqual(original);

        const invoices = invoiceListResponseSchema.parse(
          await (await app.request('/api/invoices', { headers: { Cookie: owner.cookie } })).json(),
        );
        const payments = paymentListResponseSchema.parse(
          await (await app.request('/api/payments', { headers: { Cookie: owner.cookie } })).json(),
        );
        const receipts = paymentReceiptListResponseSchema.parse(
          await (await app.request('/api/receipts', { headers: { Cookie: owner.cookie } })).json(),
        );
        expect(invoices.invoices).toHaveLength(1);
        expect(payments.payments).toHaveLength(1);
        expect(receipts.receipts).toHaveLength(1);

        const conflict = await postSale(app, owner.cookie, 'sale-retry-1', {
          lines: [{ quantity: '1', price: '9.00' }],
          paymentMethod: 'credit_card',
        });
        expect(conflict.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
        expect(invoiceListResponseSchema.parse(
          await (await app.request('/api/invoices', { headers: { Cookie: owner.cookie } })).json(),
        ).invoices).toHaveLength(1);

        const isolated = await postSale(app, other.cookie, 'sale-retry-1', {
          lines: [{ quantity: '1', price: '2.00' }],
          paymentMethod: 'bank_transfer',
        });
        expect(isolated.status).toBe(201);
        expect(saleResponseSchema.parse(await isolated.json()).invoice.id).not.toBe(original.invoice.id);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('rings up the walk-in customer once per organisation and posts one balanced pair of journals', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Walk In A');
        const ownerB = await signUp(app, 'Walk In B');
        await saveProfile(app, ownerA.cookie);
        await saveProfile(app, ownerB.cookie);
        const pie = await createItem(app, ownerA.cookie, { name: 'Pie', salePrice: '4.50' });

        const first = saleResponseSchema.parse(await (await postSale(app, ownerA.cookie, 'walk-in-1', {
          lines: [{ itemId: pie.id, quantity: '3', price: '4.50' }],
          paymentMethod: 'cash',
        })).json());
        expect(first.invoice.taxInclusive).toBe(true);
        expect(first.invoice.date).toBe(first.invoice.dueDate);
        expect(first.invoice.status).toBe('paid');
        expect(first.invoice.paymentStatus).toBe('paid');
        expect(first.invoice.balanceDue).toBe('0.00');
        expect(first.invoice.total).toBe('13.50');
        expect(first.invoice.taxAmount).toBe('1.76');
        expect(first.invoice.items.map((line) => line.description)).toEqual(['Pie']);
        expect(first.payment.status).toBe('completed');
        expect(first.payment.paymentMethod).toBe('cash');
        expect(first.payment.amount).toBe(first.invoice.total);
        expect(first.receipt.receiptData.customerEmail).toBeNull();
        expect(first.receipt.paymentId).toBe(first.payment.id);

        const listed = paymentReceiptListResponseSchema.parse(await (await app.request(
          `/api/receipts?invoiceId=${first.invoice.id}`,
          { headers: { Cookie: ownerA.cookie } },
        )).json());
        expect(listed.receipts.map((receipt) => receipt.id)).toEqual([first.receipt.id]);

        const customersA = customerListResponseSchema.parse(
          await (await app.request('/api/customers', { headers: { Cookie: ownerA.cookie } })).json(),
        );
        const walkIns = customersA.customers.filter((customer) => customer.tags?.includes('walk-in'));
        expect(walkIns).toHaveLength(1);
        expect(walkIns[0]).toMatchObject({ name: 'Walk-in customer', email: '' });
        expect(first.invoice.customerId).toBe(walkIns[0]?.id);

        const second = saleResponseSchema.parse(await (await postSale(app, ownerA.cookie, 'walk-in-2', {
          lines: [{ quantity: '1', price: '9.00', label: 'Cake' }],
          paymentMethod: 'credit_card',
          referenceNumber: 'EFT-9',
        })).json());
        expect(second.invoice.customerId).toBe(first.invoice.customerId);
        expect(second.invoice.items[0]?.description).toBe('Cake');
        expect(second.payment.referenceNumber).toBe('EFT-9');
        expect(second.payment.paymentMethod).toBe('credit_card');
        const stillOne = customerListResponseSchema.parse(
          await (await app.request('/api/customers', { headers: { Cookie: ownerA.cookie } })).json(),
        ).customers.filter((customer) => customer.tags?.includes('walk-in'));
        expect(stillOne).toHaveLength(1);

        const renamed = await app.request(`/api/customers/${walkIns[0]?.id}`, {
          method: 'PATCH',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({ tags: ['retail'] }),
        });
        expect(renamed.status).toBe(200);
        const recreated = saleResponseSchema.parse(await (await postSale(app, ownerA.cookie, 'walk-in-3', {
          lines: [{ quantity: '1', price: '2.00' }],
          paymentMethod: 'bank_transfer',
        })).json());
        expect(recreated.invoice.customerId).not.toBe(first.invoice.customerId);
        expect(recreated.invoice.items[0]?.description).toBe('Custom amount');
        const walkInsAgain = customerListResponseSchema.parse(
          await (await app.request('/api/customers', { headers: { Cookie: ownerA.cookie } })).json(),
        ).customers.filter((customer) => customer.tags?.includes('walk-in'));
        expect(walkInsAgain.map((customer) => customer.id)).toEqual([recreated.invoice.customerId]);

        const other = saleResponseSchema.parse(await (await postSale(app, ownerB.cookie, 'walk-in-b', {
          lines: [{ quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
        })).json());
        expect(other.invoice.customerId).not.toBe(recreated.invoice.customerId);
        const customersB = customerListResponseSchema.parse(
          await (await app.request('/api/customers', { headers: { Cookie: ownerB.cookie } })).json(),
        );
        expect(customersB.customers.map((customer) => customer.id)).not.toContain(recreated.invoice.customerId);
        const hidden = await app.request(`/api/invoices/${first.invoice.id}`, { headers: { Cookie: ownerB.cookie } });
        expect(hidden.status).toBe(404);

        const lines = await sql.unsafe(
          `SELECT journal_entries.reference_type, journal_entries.reference_id,
                  journal_entry_lines.debit_amount, journal_entry_lines.credit_amount
             FROM journal_entries
             JOIN journal_entry_lines ON journal_entry_lines.journal_entry_id = journal_entries.id
            WHERE journal_entries.reference_id = ? OR journal_entries.reference_id = ?`,
          [first.invoice.id, first.payment.id],
        ) as Array<{
          reference_type: string;
          reference_id: string;
          debit_amount: string;
          credit_amount: string;
        }>;
        const invoiceLines = lines.filter((line) => line.reference_type === 'invoice' && line.reference_id === first.invoice.id);
        const paymentLines = lines.filter((line) => line.reference_type === 'invoice_payment' && line.reference_id === first.payment.id);
        expect(invoiceLines.length).toBeGreaterThan(0);
        expect(paymentLines.length).toBeGreaterThan(0);
        for (const group of [invoiceLines, paymentLines]) {
          const debit = group.reduce((sum, line) => sum.add(line.debit_amount), decimal(0));
          const credit = group.reduce((sum, line) => sum.add(line.credit_amount), decimal(0));
          expect(debit.compare(credit)).toBe(0);
          expect(debit.compare(0)).toBeGreaterThan(0);
        }
        const entries = await sql.unsafe(
          `SELECT reference_type FROM journal_entries WHERE reference_id = ? OR reference_id = ?`,
          [first.invoice.id, first.payment.id],
        ) as Array<{ reference_type: string }>;
        expect(entries.map((entry) => entry.reference_type).sort()).toEqual(['invoice', 'invoice_payment']);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('uses the named customer and that customer email, including an empty email', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Named Sale');
        await saveProfile(app, owner.cookie);
        const named = await app.request('/api/customers', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Aroha', email: 'aroha@example.com', country: 'NZ' }),
        });
        expect(named.status).toBe(201);
        const namedId = ((await named.json()) as { id: string }).id;
        const blank = await app.request('/api/customers', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ name: 'No email', email: '', country: 'NZ' }),
        });
        expect(blank.status).toBe(201);
        const blankId = ((await blank.json()) as { id: string }).id;

        const withEmail = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'named-1', {
          lines: [{ quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
          customerId: namedId,
        })).json());
        expect(withEmail.invoice.customerId).toBe(namedId);
        expect(withEmail.receipt.receiptData.customerEmail).toBe('aroha@example.com');
        const withBlank = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'named-2', {
          lines: [{ quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
          customerId: blankId,
        })).json());
        expect(withBlank.receipt.receiptData.customerEmail).toBeNull();
        const walkIns = customerListResponseSchema.parse(
          await (await app.request('/api/customers', { headers: { Cookie: owner.cookie } })).json(),
        ).customers.filter((customer) => customer.tags?.includes('walk-in'));
        expect(walkIns).toHaveLength(0);

        const missing = await postSale(app, owner.cookie, 'named-missing', {
          lines: [{ quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
          customerId: '55555555-5555-4555-8555-555555555555',
        });
        expect(missing.status).toBe(400);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('applies the 15 percent GST fixtures, item rates, and a zero rate', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Gst Sale');
        await saveProfile(app, owner.cookie);
        const plain = await createItem(app, owner.cookie, { name: 'Plain', salePrice: '4.50', taxRate: null });
        const rated = await createItem(app, owner.cookie, { name: 'Rated', salePrice: '4.50', taxRate: '15' });
        const ten = await createItem(app, owner.cookie, { name: 'Roll', salePrice: '11.00', taxRate: '10' });

        const threePies = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'gst-1', {
          lines: [{ itemId: plain.id, quantity: '3', price: '4.50' }],
          paymentMethod: 'cash',
        })).json());
        expect(threePies.invoice.total).toBe('13.50');
        expect(threePies.invoice.taxAmount).toBe('1.76');

        const mixed = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'gst-2', {
          lines: [
            { quantity: '1', price: '9.00' },
            { quantity: '2', price: '4.50' },
          ],
          paymentMethod: 'cash',
        })).json());
        expect(mixed.invoice.total).toBe('18.00');
        expect(mixed.invoice.taxAmount).toBe('2.35');

        const tenCents = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'gst-3', {
          lines: [{ quantity: '1', price: '0.10' }],
          paymentMethod: 'cash',
        })).json());
        expect(tenCents.invoice.total).toBe('0.10');
        expect(tenCents.invoice.taxAmount).toBe('0.01');

        const lineRate = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'gst-4', {
          lines: [
            { itemId: ten.id, quantity: '1', price: '11.00' },
            { quantity: '1', price: '11.50' },
          ],
          paymentMethod: 'cash',
        })).json());
        expect(lineRate.invoice.total).toBe('22.50');
        expect(lineRate.invoice.taxAmount).toBe('2.50');

        await saveProfile(app, owner.cookie, { gstRegistrationStatus: 'not_registered', defaultTaxRate: '15' });
        const unregistered = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'gst-5', {
          lines: [{ itemId: rated.id, quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
        })).json());
        expect(unregistered.invoice.total).toBe('4.50');
        expect(unregistered.invoice.taxAmount).toBe('0.00');

        await saveProfile(app, owner.cookie, { gstRegistrationStatus: 'registered', defaultTaxRate: '0' });
        const zeroDefault = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'gst-6', {
          lines: [{ quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
        })).json());
        expect(zeroDefault.invoice.total).toBe('4.50');
        expect(zeroDefault.invoice.taxAmount).toBe('0.00');
        const itemRate = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'gst-7', {
          lines: [{ itemId: rated.id, quantity: '3', price: '4.50' }],
          paymentMethod: 'cash',
        })).json());
        expect(itemRate.invoice.total).toBe('13.50');
        expect(itemRate.invoice.taxAmount).toBe('1.76');

        await saveProfile(app, owner.cookie, { gstRegistrationStatus: 'unknown', defaultTaxRate: '15' });
        const unknownStatus = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'gst-8', {
          lines: [{ quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
        })).json());
        expect(unknownStatus.invoice.total).toBe('4.50');
        expect(unknownStatus.invoice.taxAmount).toBe('0.59');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('dates the invoice today in the business timezone', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Timezone Sale');
        await saveProfile(app, owner.cookie);
        const settings = await app.request('/api/currency-settings', {
          method: 'PATCH',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ timezone: 'Pacific/Niue' }),
        });
        expect(settings.status).toBe(200);
        const before = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Pacific/Niue', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        const sale = saleResponseSchema.parse(await (await postSale(app, owner.cookie, 'tz-1', {
          lines: [{ quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
        })).json());
        const after = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Pacific/Niue', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        expect(sale.invoice.date).toBe(sale.invoice.dueDate);
        expect(sale.invoice.date).toBe(sale.payment.paymentDate);
        expect([before, after]).toContain(sale.invoice.date);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('gives two quick sales in one organisation distinct receipt numbers', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Receipt Numbers');
        await saveProfile(app, owner.cookie);
        const body = { lines: [{ quantity: '1', price: '4.50' }], paymentMethod: 'cash' as const };
        const [firstResponse, secondResponse] = await Promise.all([
          postSale(app, owner.cookie, 'rec-a', body),
          postSale(app, owner.cookie, 'rec-b', body),
        ]);
        expect(firstResponse.status).toBe(201);
        expect(secondResponse.status).toBe(201);
        const first = saleResponseSchema.parse(await firstResponse.json());
        const second = saleResponseSchema.parse(await secondResponse.json());
        expect(first.receipt.receiptNumber).toMatch(/^REC-\d{6}-\d{4}$/);
        expect(second.receipt.receiptNumber).toMatch(/^REC-\d{6}-\d{4}$/);
        expect(first.receipt.receiptNumber).not.toBe(second.receipt.receiptNumber);
        expect(first.invoice.id).not.toBe(second.invoice.id);
        const receipts = paymentReceiptListResponseSchema.parse(
          await (await app.request('/api/receipts', { headers: { Cookie: owner.cookie } })).json(),
        );
        expect(new Set(receipts.receipts.map((receipt) => receipt.receiptNumber)).size).toBe(2);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('concurrent identical requests create one invoice, payment, and receipt', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Concurrent Sale');
        await saveProfile(app, owner.cookie);
        const body = { lines: [{ quantity: '2', price: '4.50' }], paymentMethod: 'cash' };
        const [firstResponse, secondResponse] = await Promise.all([
          postSale(app, owner.cookie, 'sale-concurrent-1', body),
          postSale(app, owner.cookie, 'sale-concurrent-1', body),
        ]);
        expect(firstResponse.status).toBe(201);
        expect(secondResponse.status).toBe(201);
        const first = saleResponseSchema.parse(await firstResponse.json());
        const second = saleResponseSchema.parse(await secondResponse.json());
        expect(second).toEqual(first);
        expect(invoiceListResponseSchema.parse(
          await (await app.request('/api/invoices', { headers: { Cookie: owner.cookie } })).json(),
        ).invoices).toHaveLength(1);
        expect(paymentListResponseSchema.parse(
          await (await app.request('/api/payments', { headers: { Cookie: owner.cookie } })).json(),
        ).payments).toHaveLength(1);
        expect(paymentReceiptListResponseSchema.parse(
          await (await app.request('/api/receipts', { headers: { Cookie: owner.cookie } })).json(),
        ).receipts).toHaveLength(1);
        const journals = await sql.unsafe(
          `SELECT id, reference_type FROM journal_entries WHERE reference_id = ? OR reference_id = ?`,
          [first.invoice.id, first.payment.id],
        );
        expect(journals).toHaveLength(2);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('rejects an inactive, missing, or foreign item and a non-positive cart', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Sale Items');
        const other = await signUp(app, 'Sale Items Other');
        await saveProfile(app, owner.cookie);
        await saveProfile(app, other.cookie);
        const active = await createItem(app, owner.cookie, { name: 'Active', salePrice: '4.50' });
        const foreign = await createItem(app, other.cookie, { name: 'Foreign', salePrice: '4.50' });
        const paused = await app.request(`/api/items/${active.id}`, {
          method: 'PATCH',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ isActive: false }),
        });
        expect(paused.status).toBe(200);

        const inactive = await postSale(app, owner.cookie, 'item-inactive', {
          lines: [{ itemId: active.id, quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
        });
        expect(inactive.status).toBe(400);
        const missing = await postSale(app, owner.cookie, 'item-missing', {
          lines: [{ itemId: '66666666-6666-4666-8666-666666666666', quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
        });
        expect(missing.status).toBe(400);
        const leaked = await postSale(app, owner.cookie, 'item-foreign', {
          lines: [{ itemId: foreign.id, quantity: '1', price: '4.50' }],
          paymentMethod: 'cash',
        });
        expect(leaked.status).toBe(400);
        const zero = await postSale(app, owner.cookie, 'item-zero', {
          lines: [{ quantity: '1', price: '0' }],
          paymentMethod: 'cheque',
        });
        expect(zero.status).toBe(400);
        expect(invoiceListResponseSchema.parse(
          await (await app.request('/api/invoices', { headers: { Cookie: owner.cookie } })).json(),
        ).invoices).toHaveLength(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
