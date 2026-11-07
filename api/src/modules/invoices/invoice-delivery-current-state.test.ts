import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import { invoices } from '../../db/schema/invoices';
import { journalEntries } from '../../db/schema/accounts';
import { sendInvoiceForUser } from './invoices.service';

describe('accepted invoice delivery cannot replace a newer financial lifecycle', () => {
  for (const change of ['cancelled', 'edited'] as const) {
    it(`preserves a draft ${change} while the email provider is in flight`, async () => withTestDb(async () => {
      const f = await settlementFixture();
      try {
        const me = await f.request<{ user: { id: string } }>('/api/me', 'GET');
        const invoice = await f.request<{ id: string }>('/api/invoices', 'POST', { customerId: f.customer.id, date: '2026-11-07', dueDate: '2026-11-21', currency: 'NZD', taxRate: '0', items: [{ description: 'Original delivery draft', quantity: '1', rate: '100' }] }, 201);
        let accepted = 0;
        const delivery = sendInvoiceForUser(f.db, me.user.id, invoice.id, {}, {
          availability: 'available',
          sendInvoice: async () => {
            // Real intervening HTTP write while transport acceptance is awaited.
            if (change === 'cancelled') await f.request(`/api/invoices/${invoice.id}/cancel`, 'POST', { reason: 'Cancelled before email acceptance' });
            else await f.request(`/api/invoices/${invoice.id}`, 'PATCH', { items: [{ description: 'Revised delivery draft', quantity: '1', rate: '200' }] });
            accepted++;
          },
        });
        // Transport acceptance is real in this fixture; completion must reject
        // stale posting rather than resurrect or issue changed financial data.
        await expect(delivery).rejects.toMatchObject({ status: 409 });
        expect(accepted).toBe(1);
        const [current] = await f.db.select().from(invoices).where(eq(invoices.id, invoice.id));
        expect(current.status).toBe('draft');
        expect(current.lifecycleStatus).toBe(change === 'cancelled' ? 'cancelled' : 'active');
        expect(current.total).toBe(change === 'cancelled' ? '100.00' : '200.00');
        const sourcePostings = await f.db.select().from(journalEntries).where(eq(journalEntries.referenceId, invoice.id));
        expect(sourcePostings.filter(row => row.referenceType === 'invoice')).toHaveLength(0);
      } finally { await f.sql.end(); }
    }));
  }
});
