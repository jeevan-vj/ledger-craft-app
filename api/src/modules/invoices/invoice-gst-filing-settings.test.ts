import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import { businessProfiles } from '../../db/schema/business-profiles';

const filing = { gstAccountingBasis: 'payments' as const, gstFilingFrequency: 'two_monthly' as const, gstPeriodAnchor: 3 };
const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' };

async function registeredProfile(db: Awaited<ReturnType<typeof settlementFixture>>['db'], profileId: string, extra: Record<string, unknown>) {
  await db.update(businessProfiles).set({
    gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01', country: 'NZ',
    gstAccountingBasis: null, gstFilingFrequency: null, gstPeriodAnchor: null, ...extra,
  }).where(eq(businessProfiles.id, profileId));
}

describe('GST filing settings before a tax invoice is issued', () => {
  it('blocks issue, share, send and draft payment until basis, frequency and period anchor are saved, while drafts stay editable', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const profile = await f.request<{ id: string }>('/api/business-profile', 'GET');
      await registeredProfile(f.db, profile.id, {});
      const buyer = await f.request<{ id: string }>('/api/customers', 'POST', { name: 'Kauri buyer', email: 'buyer@example.test' }, 201);
      const input = { customerId: buyer.id, date: '2026-10-15', dueDate: '2026-11-15', currency: 'NZD', taxInclusive: true, taxRate: '15', items: [{ description: 'Reviewed services', quantity: '1', rate: '115.00' }] };
      const draft = await f.request<{ id: string; status: string; notes: string | null }>('/api/invoices', 'POST', input, 201);
      expect(draft.status).toBe('draft');
      const edited = await f.request<{ status: string; notes: string | null }>(`/api/invoices/${draft.id}`, 'PATCH', { notes: 'Still a draft' });
      expect(edited).toMatchObject({ status: 'draft', notes: 'Still a draft' });

      const paths = [
        [`/api/invoices/${draft.id}`, 'PATCH', { status: 'sent' }],
        [`/api/invoices/${draft.id}/share`, 'POST', {}],
        [`/api/invoices/${draft.id}/send`, 'POST', { to: ['buyer@example.test'] }],
        ['/api/payments', 'POST', { invoiceId: draft.id, amount: '115.00', paymentDate: '2026-10-15', paymentMethod: 'bank_transfer' }],
      ] as const;
      for (const [path, method, body] of paths) {
        const blocked = await f.request<{ error: { code: string; message: string } }>(path, method, body, 422);
        expect(blocked.error.code).toBe('GST_FILING_SETTINGS_REQUIRED');
        expect(blocked.error.message).toMatch(/GST settings/i);
      }
      expect((await f.request<{ status: string }>(`/api/invoices/${draft.id}`, 'GET')).status).toBe('draft');

      await registeredProfile(f.db, profile.id, { gstAccountingBasis: 'payments' });
      expect((await f.request<{ error: { code: string } }>(`/api/invoices/${draft.id}`, 'PATCH', { status: 'sent' }, 422)).error.code).toBe('GST_FILING_SETTINGS_REQUIRED');
      await registeredProfile(f.db, profile.id, { gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly' });
      expect((await f.request<{ error: { code: string } }>(`/api/invoices/${draft.id}`, 'PATCH', { status: 'sent' }, 422)).error.code).toBe('GST_FILING_SETTINGS_REQUIRED');

      await registeredProfile(f.db, profile.id, filing);
      expect((await f.request<{ status: string }>(`/api/invoices/${draft.id}`, 'PATCH', { status: 'sent' })).status).toBe('sent');
      const second = await f.request<{ id: string }>('/api/invoices', 'POST', input, 201);
      expect((await f.request<{ shareToken: string }>(`/api/invoices/${second.id}/share`, 'POST', {}, 201)).shareToken).toBeTruthy();
      const third = await f.request<{ id: string; status: string }>('/api/invoices', 'POST', input, 201);
      const paid = await f.request<{ id: string }>('/api/payments', 'POST', { invoiceId: third.id, amount: '115.00', paymentDate: '2026-10-15', paymentMethod: 'bank_transfer' }, 201);
      expect(paid.id).toBeTruthy();
      expect((await f.request<{ status: string }>(`/api/invoices/${third.id}`, 'GET')).status).not.toBe('draft');
    } finally { await f.sql.end(); }
  }));

  it('leaves a non-registered or non-NZ business able to issue without filing settings', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const profile = await f.request<{ id: string }>('/api/business-profile', 'GET');
      const buyer = await f.request<{ id: string }>('/api/customers', 'POST', { name: 'Plain buyer', email: 'plain@example.test' }, 201);
      const input = { customerId: buyer.id, date: '2026-10-15', dueDate: '2026-11-15', currency: 'NZD', taxInclusive: true, taxRate: '0', items: [{ description: 'Services', quantity: '1', rate: '50.00' }] };
      await f.db.update(businessProfiles).set({ gstRegistrationStatus: 'not_registered', taxId: null, gstRegisteredFrom: null, gstAccountingBasis: null, gstFilingFrequency: null, gstPeriodAnchor: null, country: 'NZ' }).where(eq(businessProfiles.id, profile.id));
      const unregistered = await f.request<{ id: string }>('/api/invoices', 'POST', input, 201);
      expect((await f.request<{ status: string }>(`/api/invoices/${unregistered.id}`, 'PATCH', { status: 'sent' })).status).toBe('sent');

      await f.db.update(businessProfiles).set({ gstRegistrationStatus: 'registered', taxId: 'ABN-example', country: 'AU', gstAccountingBasis: null, gstFilingFrequency: null, gstPeriodAnchor: null }).where(eq(businessProfiles.id, profile.id));
      const foreign = await f.request<{ id: string }>('/api/invoices', 'POST', input, 201);
      expect((await f.request<{ status: string }>(`/api/invoices/${foreign.id}`, 'PATCH', { status: 'sent' })).status).toBe('sent');
    } finally { await f.sql.end(); }
  }));

  it('does not let one organisation’s saved filing settings unlock another organisation’s tax invoice', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const profile = await f.request<{ id: string }>('/api/business-profile', 'GET');
      await registeredProfile(f.db, profile.id, {});
      const buyer = await f.request<{ id: string }>('/api/customers', 'POST', { name: 'First buyer', email: 'first@example.test' }, 201);
      const input = { customerId: buyer.id, date: '2026-10-15', dueDate: '2026-11-15', currency: 'NZD', taxInclusive: true, taxRate: '15', items: [{ description: 'Services', quantity: '1', rate: '115.00' }] };
      const draft = await f.request<{ id: string }>('/api/invoices', 'POST', input, 201);

      const signup = await f.app.request('/api/auth/sign-up/email', { method: 'POST', headers, body: JSON.stringify({ name: 'Other owner', email: `${crypto.randomUUID()}@example.test`, password: 'Local-password123' }) });
      const cookie = signup.headers.getSetCookie().map(part => part.split(';')[0]).join('; ');
      const other = async <T = Record<string, unknown>>(path: string, method: string, body?: unknown, expected = 200) => {
        const response = await f.app.request(path, { method, headers: { ...headers, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await response.text();
        const value = text ? JSON.parse(text) as T : null;
        expect(response.status, JSON.stringify(value)).toBe(expected);
        return value as T;
      };
      await other('/api/business-profile', 'PUT', { name: 'Other Studio', email: 'other@example.test', country: 'NZ', defaultTaxRate: '15', gstRegistrationStatus: 'registered', taxId: '49091850', gstRegisteredFrom: '2026-04-01', ...filing });
      const otherBuyer = await other<{ id: string }>('/api/customers', 'POST', { name: 'Other buyer', email: 'other-buyer@example.test' }, 201);
      const otherDraft = await other<{ id: string }>('/api/invoices', 'POST', { ...input, customerId: otherBuyer.id }, 201);
      expect((await other<{ status: string }>(`/api/invoices/${otherDraft.id}`, 'PATCH', { status: 'sent' })).status).toBe('sent');
      expect((await f.request<{ error: { code: string } }>(`/api/invoices/${draft.id}`, 'PATCH', { status: 'sent' }, 422)).error.code).toBe('GST_FILING_SETTINGS_REQUIRED');
      await other(`/api/invoices/${draft.id}`, 'PATCH', { status: 'sent' }, 404);
      expect((await f.request<{ status: string }>(`/api/invoices/${draft.id}`, 'GET')).status).toBe('draft');
    } finally { await f.sql.end(); }
  }));
});
