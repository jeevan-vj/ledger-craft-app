import { describe, expect, it } from 'vitest';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';

describe('supplier partial payment retries', () => {
  it('replays a lost response without a second payment or FX journal and rejects another amount under that key', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request(`/api/bills/${f.bill.id}/receive`, 'POST', {});
      const input = { bankAccountId: f.bank.id, amount: '25', paymentDate: '2026-10-20', exchangeRateId: f.rate.id };
      const headers = { Cookie: f.cookie, Origin: 'http://localhost:8080', 'Content-Type': 'application/json', 'Idempotency-Key': 'supplier-partial-attempt-1' };
      const first = await f.app.request(`/api/bills/${f.bill.id}/payments`, { method: 'POST', headers, body: JSON.stringify(input) });
      expect(first.status).toBe(201);
      const original: unknown = await first.json();
      const retry = await f.app.request(`/api/bills/${f.bill.id}/payments`, { method: 'POST', headers, body: JSON.stringify(input) });
      expect(retry.status).toBe(201);
      expect(await retry.json()).toEqual(original);
      const conflicting = await f.app.request(`/api/bills/${f.bill.id}/payments`, { method: 'POST', headers, body: JSON.stringify({ ...input, amount: '30' }) });
      expect(conflicting.status).toBe(409);
      expect((await f.sql.unsafe('SELECT count(*) AS n FROM bill_payments'))[0]?.n).toBe(1);
      expect((await f.sql.unsafe(`SELECT count(*) AS n FROM journal_entries WHERE reference_type='bill_payment'`))[0]?.n).toBe(1);
      expect(await f.request(`/api/bills/${f.bill.id}`, 'GET')).toMatchObject({ totalPaid: '25.00', balanceDue: '75.00' });
    } finally { await f.sql.end({ timeout: 5 }); }
  }));
});
