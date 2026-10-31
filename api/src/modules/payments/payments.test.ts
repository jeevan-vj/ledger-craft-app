import {
  accountListResponseSchema,
  errorEnvelopeSchema,
  invoiceSchema,
  paymentSchema,
} from '@ledgercraft/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { createDb } from '../../db/local';
import { getDatabaseUrl } from '../../env';
import { createAuth } from '../auth/auth';
import { assertLocalDatabaseReachable, withTestDb } from '../../test/harness';

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

async function seedInvoice(app: ReturnType<typeof createApp>, cookie: string) {
  await app.request('/api/business-profile', {
    method: 'PUT',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      name: 'Kauri Studio Ltd',
      email: 'hello@kauristudio.nz',
      country: 'NZ',
      defaultTaxRate: '15',
      invoiceNumberFormat: 'INV-{YYYY}-{SEQ}',
      invoiceNumberSequence: 0,
    }),
  });
  const customer = await app.request('/api/customers', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({ name: 'North Harbour Cafe', email: 'hello@nhcafe.nz', country: 'NZ' }),
  });
  expect(customer.status).toBe(201);
  const customerId = ((await customer.json()) as { id: string }).id;
  const created = await app.request('/api/invoices', {
    method: 'POST',
    headers: { ...originHeaders, Cookie: cookie },
    body: JSON.stringify({
      customerId,
      date: '2026-09-08',
      dueDate: '2026-10-08',
      taxInclusive: false,
      taxRate: '15',
      items: [{ description: 'Brand identity', quantity: '1', rate: '4500' }],
    }),
  });
  expect(created.status).toBe(201);
  return invoiceSchema.parse(await created.json());
}

describe('payment routes', () => {
  it('unauthenticated GET /api/payments and /api/accounts return 401', async () => {
    const payments = await createApp().request('/api/payments');
    expect(payments.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await payments.json()).error.code).toBe('UNAUTHORIZED');
    const accounts = await createApp().request('/api/accounts');
    expect(accounts.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await accounts.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('records a payment and updates invoice totals in one transaction', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner A');
        const ownerB = await signUp(app, 'Owner B');
        const invoice = await seedInvoice(app, ownerA.cookie);
        expect(invoice.total).toBe('5175.00');
        expect(invoice.balanceDue).toBe('5175.00');

        const overpay = await app.request('/api/payments', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            invoiceId: invoice.id,
            paymentMethod: 'bank_transfer',
            amount: '5175.01',
            paymentDate: '2026-09-08',
          }),
        });
        expect(overpay.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await overpay.json()).error.code).toBe(
          'PAYMENT_EXCEEDS_BALANCE',
        );

        const ownership = await app.request('/api/payments', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            invoiceId: invoice.id,
            paymentMethod: 'bank_transfer',
            amount: '1000.00',
            paymentDate: '2026-09-08',
            organisationId: '11111111-1111-1111-1111-111111111111',
          }),
        });
        expect(ownership.status).toBe(400);

        const created = await app.request('/api/payments', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            invoiceId: invoice.id,
            paymentMethod: 'bank_transfer',
            amount: '1000.00',
            paymentDate: '2026-09-08',
            referenceNumber: 'REF-1',
          }),
        });
        expect(created.status).toBe(201);
        const payment = paymentSchema.parse(await created.json());
        expect(payment.amount).toBe('1000.00');
        expect(payment.status).toBe('completed');

        const afterPartial = invoiceSchema.parse(
          await (await app.request(`/api/invoices/${invoice.id}`, { headers: { Cookie: ownerA.cookie } })).json(),
        );
        expect(afterPartial.totalPaid).toBe('1000.00');
        expect(afterPartial.balanceDue).toBe('4175.00');
        expect(afterPartial.paymentStatus).toBe('partially_paid');

        const leaked = await app.request(`/api/payments/${payment.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(leaked.status).toBe(404);

        const foreignInvoice = await app.request('/api/payments', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerB.cookie },
          body: JSON.stringify({
            invoiceId: invoice.id,
            paymentMethod: 'cash',
            amount: '10.00',
            paymentDate: '2026-09-08',
          }),
        });
        expect(foreignInvoice.status).toBe(404);

        const remainder = await app.request('/api/payments', {
          method: 'POST',
          headers: { ...originHeaders, Cookie: ownerA.cookie },
          body: JSON.stringify({
            invoiceId: invoice.id,
            paymentMethod: 'cash',
            amount: '4175.00',
            paymentDate: '2026-09-08',
          }),
        });
        expect(remainder.status).toBe(201);
        const paid = invoiceSchema.parse(
          await (await app.request(`/api/invoices/${invoice.id}`, { headers: { Cookie: ownerA.cookie } })).json(),
        );
        expect(paid.totalPaid).toBe('5175.00');
        expect(paid.balanceDue).toBe('0.00');
        expect(paid.paymentStatus).toBe('paid');
        expect(paid.status).toBe('paid');

        const accounts = accountListResponseSchema.parse(
          await (await app.request('/api/accounts', { headers: { Cookie: ownerA.cookie } })).json(),
        );
        expect(accounts.accounts.some((row) => row.accountNumber === '1200')).toBe(true);
        const leakedAccounts = accountListResponseSchema.parse(
          await (await app.request('/api/accounts', { headers: { Cookie: ownerB.cookie } })).json(),
        );
        expect(leakedAccounts.accounts).toEqual([]);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('rejects payment amounts with more than 2 decimal places and still replays an accepted payment', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner Cents');
        const invoice = await seedInvoice(app, owner.cookie);
        const post = (amount: string, key: string) =>
          app.request('/api/payments', {
            method: 'POST',
            headers: { ...originHeaders, Cookie: owner.cookie, 'Idempotency-Key': key },
            body: JSON.stringify({
              invoiceId: invoice.id,
              paymentMethod: 'cash',
              amount,
              paymentDate: '2026-09-08',
            }),
          });

        for (const amount of ['1.005', '0.001']) {
          const rejected = await post(amount, `reject-${amount}`);
          expect(rejected.status).toBe(400);
          const error = errorEnvelopeSchema.parse(await rejected.json()).error;
          expect(error.code).toBe('VALIDATION_ERROR');
          expect(error.message).toMatch(/at most 2 decimal places/);
        }
        expect(await sql.unsafe(`SELECT id FROM payments WHERE invoice_id = ?`, [invoice.id])).toHaveLength(0);

        const accepted = await post('1.00', 'accept-1-00');
        expect(accepted.status).toBe(201);
        const original = paymentSchema.parse(await accepted.json());
        expect(original.amount).toBe('1.00');

        const oneDecimal = await post('1.5', 'accept-1-5');
        expect(oneDecimal.status).toBe(201);
        expect(paymentSchema.parse(await oneDecimal.json()).amount).toBe('1.50');

        const whole = await post('10', 'accept-10');
        expect(whole.status).toBe(201);
        expect(paymentSchema.parse(await whole.json()).amount).toBe('10.00');

        const replay = await post('1.00', 'accept-1-00');
        expect(replay.status).toBe(201);
        expect(paymentSchema.parse(await replay.json())).toEqual(original);
        expect(await sql.unsafe(`SELECT id FROM payments WHERE invoice_id = ?`, [invoice.id])).toHaveLength(3);

        const afterReject = await post('1.00', 'reject-1.005');
        expect(afterReject.status).toBe(201);
        expect(paymentSchema.parse(await afterReject.json()).amount).toBe('1.00');
        expect(await sql.unsafe(`SELECT id FROM payments WHERE invoice_id = ?`, [invoice.id])).toHaveLength(4);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('retried payment with the same Idempotency-Key returns the original payment', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const ownerA = await signUp(app, 'Owner Idempotent A');
        const ownerB = await signUp(app, 'Owner Idempotent B');
        const invoice = await seedInvoice(app, ownerA.cookie);
        const payload = {
          invoiceId: invoice.id,
          paymentMethod: 'bank_transfer',
          amount: '1000.00',
          paymentDate: '2026-09-08',
          referenceNumber: 'REF-RETRY',
        };
        const headers = {
          ...originHeaders,
          Cookie: ownerA.cookie,
          'Idempotency-Key': 'payment-retry-1',
        };

        const first = await app.request('/api/payments', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        expect(first.status).toBe(201);
        const original = paymentSchema.parse(await first.json());

        const retry = await app.request('/api/payments', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        expect(retry.status).toBe(201);
        const replayed = paymentSchema.parse(await retry.json());
        expect(replayed).toEqual(original);

        const afterRetry = invoiceSchema.parse(
          await (await app.request(`/api/invoices/${invoice.id}`, { headers: { Cookie: ownerA.cookie } })).json(),
        );
        expect(afterRetry.totalPaid).toBe('1000.00');
        expect(afterRetry.balanceDue).toBe('4175.00');
        const storedPayments = await sql.unsafe(
          `SELECT id FROM payments WHERE organisation_id IS NOT NULL AND invoice_id = ?`,
          [invoice.id],
        );
        expect(storedPayments).toHaveLength(1);
        const paymentJournals = await sql.unsafe(
          `SELECT id FROM journal_entries WHERE reference_type = 'invoice_payment' AND reference_id = ?`,
          [original.id],
        );
        expect(paymentJournals).toHaveLength(1);

        const conflict = await app.request('/api/payments', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...payload, amount: '500.00' }),
        });
        expect(conflict.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
        expect(
          await sql.unsafe(`SELECT id FROM payments WHERE invoice_id = ?`, [invoice.id]),
        ).toHaveLength(1);

        const otherInvoice = await seedInvoice(app, ownerB.cookie);
        const other = await app.request('/api/payments', {
          method: 'POST',
          headers: {
            ...originHeaders,
            Cookie: ownerB.cookie,
            'Idempotency-Key': 'payment-retry-1',
          },
          body: JSON.stringify({
            invoiceId: otherInvoice.id,
            paymentMethod: 'cash',
            amount: '250.00',
            paymentDate: '2026-09-08',
          }),
        });
        expect(other.status).toBe(201);
        const otherPayment = paymentSchema.parse(await other.json());
        expect(otherPayment.id).not.toBe(original.id);
        const hidden = await app.request(`/api/payments/${original.id}`, {
          headers: { Cookie: ownerB.cookie },
        });
        expect(hidden.status).toBe(404);
        const stillOriginal = paymentSchema.parse(
          await (
            await app.request('/api/payments', {
              method: 'POST',
              headers,
              body: JSON.stringify(payload),
            })
          ).json(),
        );
        expect(stillOriginal.id).toBe(original.id);
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('concurrent payments with the same Idempotency-Key create one payment and one journal', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner Concurrent');
        const invoice = await seedInvoice(app, owner.cookie);
        const payload = {
          invoiceId: invoice.id,
          paymentMethod: 'bank_transfer',
          amount: '1000.00',
          paymentDate: '2026-09-08',
        };
        const headers = {
          ...originHeaders,
          Cookie: owner.cookie,
          'Idempotency-Key': 'payment-concurrent-1',
        };
        const [first, second] = await Promise.all([
          app.request('/api/payments', { method: 'POST', headers, body: JSON.stringify(payload) }),
          app.request('/api/payments', { method: 'POST', headers, body: JSON.stringify(payload) }),
        ]);
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        const firstPayment = paymentSchema.parse(await first.json());
        const secondPayment = paymentSchema.parse(await second.json());
        expect(secondPayment).toEqual(firstPayment);

        const storedPayments = await sql.unsafe(`SELECT id FROM payments WHERE invoice_id = ?`, [invoice.id]);
        expect(storedPayments).toHaveLength(1);
        const paymentJournals = await sql.unsafe(
          `SELECT id FROM journal_entries WHERE reference_type = 'invoice_payment' AND reference_id = ?`,
          [firstPayment.id],
        );
        expect(paymentJournals).toHaveLength(1);
        const paid = invoiceSchema.parse(
          await (await app.request(`/api/invoices/${invoice.id}`, { headers: { Cookie: owner.cookie } })).json(),
        );
        expect(paid.totalPaid).toBe('1000.00');
        expect(paid.balanceDue).toBe('4175.00');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  it('reverses a completed instalment without rewriting its audit trail', async () => {
    await assertLocalDatabaseReachable();
    await withTestDb(async () => {
      const { db, sql } = createDb(getDatabaseUrl());
      try {
        const auth = createAuth(db);
        const app = createApp({ auth, db, checkDatabase: async () => true });
        const owner = await signUp(app, 'Owner Reversal');
        const outsider = await signUp(app, 'Owner Reversal Outsider');
        const invoice = await seedInvoice(app, owner.cookie);

        const createPayment = async (amount: string, referenceNumber: string) => {
          const response = await app.request('/api/payments', {
            method: 'POST',
            headers: { ...originHeaders, Cookie: owner.cookie },
            body: JSON.stringify({
              invoiceId: invoice.id,
              paymentMethod: 'bank_transfer',
              amount,
              paymentDate: '2026-09-08',
              referenceNumber,
            }),
          });
          expect(response.status).toBe(201);
          return paymentSchema.parse(await response.json());
        };

        const reversedPayment = await createPayment('1000.00', 'REF-REV-1');
        await createPayment('500.00', 'REF-KEEP-1');

        const hidden = await app.request(`/api/payments/${reversedPayment.id}/reverse`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: outsider.cookie },
          body: JSON.stringify({ reason: 'Payment was entered against the wrong invoice', reversalDate: '2026-09-10' }),
        });
        expect(hidden.status).toBe(404);

        const beforePaymentDate = await app.request(`/api/payments/${reversedPayment.id}/reverse`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ reason: 'Payment was entered against the wrong invoice', reversalDate: '2026-09-07' }),
        });
        expect(beforePaymentDate.status).toBe(400);
        expect(errorEnvelopeSchema.parse(await beforePaymentDate.json()).error.code).toBe('REVERSAL_PRECEDES_PAYMENT');

        const reversed = await app.request(`/api/payments/${reversedPayment.id}/reverse`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ reason: 'Payment was entered against the wrong invoice', reversalDate: '2026-09-10' }),
        });
        expect(reversed.status).toBe(200);
        expect(paymentSchema.parse(await reversed.json())).toMatchObject({
          id: reversedPayment.id,
          amount: '1000.00',
          referenceNumber: 'REF-REV-1',
          status: 'refunded',
          reversalReason: 'Payment was entered against the wrong invoice',
          reversalDate: '2026-09-10',
        });

        const after = invoiceSchema.parse(
          await (await app.request(`/api/invoices/${invoice.id}`, { headers: { Cookie: owner.cookie } })).json(),
        );
        expect(after.totalPaid).toBe('500.00');
        expect(after.balanceDue).toBe('4675.00');
        expect(after.paymentStatus).toBe('partially_paid');
        expect(after.status).toBe('sent');

        const sourceJournals = await sql.unsafe(
          `SELECT id, status FROM journal_entries WHERE reference_type = 'invoice_payment' AND reference_id = ?`,
          [reversedPayment.id],
        ) as Array<{ id: string; status: string }>;
        expect(sourceJournals).toHaveLength(1);
        expect(sourceJournals[0]?.status).toBe('reversed');
        const reversalJournals = await sql.unsafe(
          `SELECT id, status FROM journal_entries WHERE reference_type = 'invoice_payment_reversal' AND reference_id = ?`,
          [sourceJournals[0]?.id],
        ) as Array<{ id: string; status: string }>;
        expect(reversalJournals).toHaveLength(1);
        expect(reversalJournals[0]?.status).toBe('posted');

        const duplicate = await app.request(`/api/payments/${reversedPayment.id}/reverse`, {
          method: 'POST',
          headers: { ...originHeaders, Cookie: owner.cookie },
          body: JSON.stringify({ reason: 'Try reversing twice', reversalDate: '2026-09-10' }),
        });
        expect(duplicate.status).toBe(409);
        expect(errorEnvelopeSchema.parse(await duplicate.json()).error.code).toBe('PAYMENT_ALREADY_REVERSED');
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });
});
