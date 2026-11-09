import { describe, expect, it } from 'vitest';
import { publicSharedInvoiceSchema } from '@ledgercraft/contracts';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';
import { businessProfiles } from '../../db/schema/business-profiles';

async function fixture() {
  const f = await settlementFixture();
  const profile = await f.request('/api/business-profile', 'GET');
  await f.db.update(businessProfiles).set({ gstRegistrationStatus: 'registered', taxId: '49098576', gstRegisteredFrom: '2026-04-01', gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 3 }).where(eq(businessProfiles.id, String(profile.id)));
  const buyer = await f.request('/api/customers', 'POST', { name: 'Buyer without identifier', email: '' }, 201);
  const input = (total: string) => ({ customerId: buyer.id, date: '2026-10-15', dueDate: '2026-11-15', currency: 'NZD', taxInclusive: true, taxRate: '15', items: [{ description: 'Reviewed services', quantity: '1', rate: total }] });
  return { ...f, buyer, input };
}

describe('GST taxable supply buyer information', () => {
  it('allows exactly1000 but rejects1000.01 without a buyer identifier and preserves the sequence', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const at = await f.request('/api/invoices', 'POST', f.input('1000.00'), 201);
      expect(at.total).toBe('1000.00');
      const before = await f.request('/api/invoices/next-number', 'GET');
      await f.request('/api/invoices', 'POST', f.input('1000.01'), 422);
      expect(await f.request('/api/invoices/next-number', 'GET')).toEqual(before);
      await f.request(`/api/customers/${f.buyer.id}`, 'PATCH', { phone: '021 555 0100' });
      const valid = await f.request('/api/invoices', 'POST', f.input('1000.01'), 201);
      expect(valid.total).toBe('1000.01');
    } finally { await f.sql.end(); }
  }));
  it('blocks a draft edit and sending/sharing after buyer identifiers are removed', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const small = await f.request('/api/invoices', 'POST', f.input('1000.00'), 201);
      await f.request(`/api/invoices/${small.id}`, 'PATCH', { items: f.input('1000.01').items }, 422);
      await f.request(`/api/customers/${f.buyer.id}`, 'PATCH', { email: 'buyer@example.test' });
      const large = await f.request('/api/invoices', 'POST', f.input('1150.00'), 201);
      await f.request(`/api/customers/${f.buyer.id}`, 'PATCH', { email: '' });
      await f.request(`/api/invoices/${large.id}/send`, 'POST', { to: ['alternate@example.test'] }, 422);
      await f.request(`/api/invoices/${large.id}/share`, 'POST', {}, 422);
      expect((await f.request(`/api/invoices/${large.id}`, 'GET')).status).toBe('draft');
    } finally { await f.sql.end(); }
  }));
  it('does not impose the registered-seller rule on an unknown seller', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const profile = await f.request('/api/business-profile', 'GET');
      await f.db.update(businessProfiles).set({ gstRegistrationStatus: 'unknown' }).where(eq(businessProfiles.id, String(profile.id)));
      expect((await f.request('/api/invoices', 'POST', f.input('1150'), 201)).total).toBe('1150.00');
    } finally { await f.sql.end(); }
  }));
  it('retains the buyer identifier in the public invoice snapshot after later customer edits', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await f.request(`/api/customers/${f.buyer.id}`, 'PATCH', { phone: '021 555 0100' });
      const large = await f.request('/api/invoices', 'POST', f.input('1150'), 201);
      const share = await f.request(`/api/invoices/${large.id}/share`, 'POST', {}, 201);
      await f.request(`/api/customers/${f.buyer.id}`, 'PATCH', { phone: '021 999 9999' });
      const response = await f.app.request(`/api/public/invoices/${share.shareToken}`);
      expect(response.status).toBe(200);
      const value = publicSharedInvoiceSchema.parse(await response.json());
      expect(value.invoice.customerDetails).toMatchObject({ name: 'Buyer without identifier', phone: '021 555 0100' });
      expect(value.businessProfile).toMatchObject({ gstRegistrationStatus: 'registered', taxId: '49098576' });
    } finally { await f.sql.end(); }
  }));
  it('allows legacy draft preparation but blocks issuing when seller registration needs review', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const profile = await f.request('/api/business-profile', 'GET');
      await f.db.update(businessProfiles).set({ gstRegisteredFrom: null }).where(eq(businessProfiles.id, String(profile.id)));
      const small = await f.request('/api/invoices', 'POST', f.input('500'), 201);
      const headers = { Origin: 'http://localhost:8080', 'Content-Type': 'application/json', Cookie: f.cookie };
      const states = [];
      for (const [path, method, body] of [[`/api/invoices/${small.id}`, 'PATCH', { status: 'sent' }], [`/api/invoices/${small.id}/share`, 'POST', {}], [`/api/invoices/${small.id}/send`, 'POST', { to: ['buyer@example.test'] }]] as const) {
        const response = await f.app.request(path, { method, headers, body: JSON.stringify(body) }); states.push(response.status);
      }
      expect(states).toEqual([422, 422, 422]);
      expect((await f.request(`/api/invoices/${small.id}`, 'GET')).status).toBe('draft');
      await f.db.update(businessProfiles).set({ gstRegisteredFrom: '2026-04-01' }).where(eq(businessProfiles.id, String(profile.id)));
      await f.request(`/api/invoices/${small.id}`, 'PATCH', { status: 'sent' });
      await f.db.update(businessProfiles).set({ gstRegisteredFrom: null }).where(eq(businessProfiles.id, String(profile.id)));
      // An old issued document can still receive a non-financial note; this is
      // not a new issuance and must not be blocked by the legacy review gate.
      await f.request(`/api/invoices/${small.id}`, 'PATCH', { notes: 'Original issue retained; registration review pending' });
    } finally { await f.sql.end(); }
  }));
  it('does not apply NZ GST identity rules to a foreign business', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const profile = await f.request('/api/business-profile', 'GET');
      await f.db.update(businessProfiles).set({ country: 'AU', taxId: 'Foreign identifier' }).where(eq(businessProfiles.id, String(profile.id)));
      expect((await f.request('/api/invoices', 'POST', f.input('1150'), 201)).total).toBe('1150.00');
    } finally { await f.sql.end(); }
  }));
  it('retains a pre-registration draft but prevents issuing its stored GST claim', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      const input = { ...f.input('500'), date: '2026-03-15' };
      const draft = await f.request('/api/invoices', 'POST', input, 201);
      const originalTax = draft.taxAmount;
      await f.request(`/api/invoices/${draft.id}`, 'PATCH', { status: 'sent' }, 422);
      await f.request(`/api/invoices/${draft.id}/share`, 'POST', {}, 422);
      const retained = await f.request(`/api/invoices/${draft.id}`, 'GET');
      expect(retained).toMatchObject({ status: 'draft', taxAmount: originalTax, total: '500.00' });
    } finally { await f.sql.end(); }
  }));
  it('uses the reviewed NZD carrying total for foreign-currency buyer thresholds', async () => withTestDb(async () => {
    const f = await fixture();
    try {
      await f.request('/api/invoices', 'POST', { ...f.input('700'), currency: 'USD' }, 422);
      await f.request(`/api/customers/${f.buyer.id}`, 'PATCH', { phone: '021 555 0100' });
      const invoice = await f.request('/api/invoices', 'POST', { ...f.input('700'), currency: 'USD' }, 201);
      expect(invoice).toMatchObject({ total: '700.00', baseCurrency: 'NZD', baseTotal: '1120.00', exchangeRate: f.sourceRate.rate });
    } finally { await f.sql.end(); }
  }));
});
