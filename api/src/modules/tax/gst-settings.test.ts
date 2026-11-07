import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { businessProfiles } from '../../db/schema/business-profiles';
import { taxReturns } from '../../db/schema/tax';
import { withTestDb } from '../../test/harness';
import { settlementFixture } from '../currency/settlement.test-helper';

const saved = { gstRegistrationStatus: 'registered', taxId: '49-091-850', gstRegisteredFrom: '2026-04-10', gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 5 };
describe('company GST settings and period overview', () => {
  it('keeps legacy settings unconfigured, round-trips reviewed settings, and isolates companies', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      expect(await f.request('/api/tax/gst-settings', 'GET')).toMatchObject({ gstAccountingBasis: null, gstRegisteredFrom: null, configured: false, reviewRequired: true });
      expect(await f.request('/api/tax/gst-settings', 'PUT', saved)).toMatchObject({ ...saved, taxId: '49091850', configured: true, reviewRequired: false });
      expect(await f.request('/api/business-profile', 'GET')).toMatchObject({ gstAccountingBasis: 'payments', gstFilingFrequency: 'two_monthly', gstPeriodAnchor: 5, gstRegisteredFrom: '2026-04-10', taxId: '49091850' });
      await f.request('/api/business-profile', 'PUT', { name: 'NZ country label', email: 'owner@example.test', country: 'New Zealand' });
      expect(await f.request('/api/tax/gst-settings', 'PUT', saved)).toMatchObject({ configured: true });
      await f.request('/api/tax/gst-settings', 'PUT', { ...saved, taxId: '123456789' }, 400);
      await f.request('/api/tax/gst-settings', 'PUT', { ...saved, gstRegisteredFrom: null }, 400);
      const other = await f.app.request('/api/auth/sign-up/email', { method: 'POST', headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Other owner', email: `${crypto.randomUUID()}@example.test`, password: 'Local-password123' }) });
      const cookie = other.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
      const response = await f.app.request('/api/tax/gst-settings', { headers: { Cookie: cookie } });
      expect(await response.json()).toMatchObject({ gstRegisteredFrom: null, configured: false });
      expect((await f.app.request('/api/tax/gst-settings')).status).toBe(401);
    } finally { await f.sql.end(); }
  }));
  it('generates clipped periods, honours saved return status and preserves filed settings after a basis change', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request('/api/tax/gst-settings', 'PUT', saved);
      const preparation = await f.request('/api/tax/gst-preparation', 'POST', { from: '2026-04-10', to: '2026-05-31', basis: 'payments', reviewConfirmed: true, adjustments: [] });
      const draft = await f.request('/api/tax-returns', 'POST', { periodStart: '2026-04-10', periodEnd: '2026-05-31', returnType: 'GST', totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00', returnData: { preparation: { basis: 'payments', baseCurrency: 'NZD', dueDate: '2026-06-29' }, gstReview: preparation.review } }, 201);
      await f.request(`/api/tax-returns/${draft.id}/file`, 'POST', { irdReference: 'MYIR-TEST-001' });
      await f.request('/api/tax/gst-settings', 'PUT', { ...saved, gstAccountingBasis: 'invoice' });
      const overview = await f.request<{ periods: Array<Record<string, unknown>> }>('/api/tax/gst-periods?asOf=2026-08-01', 'GET');
      expect(overview.periods[0]).toMatchObject({ periodStart: '2026-04-10', periodEnd: '2026-05-31', dueDate: '2026-06-29', status: 'filed', taxReturnId: draft.id, irdReference: 'MYIR-TEST-001', netGst: '0.00' });
      expect(overview.periods[1]).toMatchObject({ periodStart: '2026-06-01', periodEnd: '2026-07-31', status: 'not_started', dueDate: '2026-08-28' });
      expect(await f.request(`/api/tax-returns/${draft.id}`, 'GET')).toMatchObject({ returnData: { preparation: { basis: 'payments' } } });
    } finally { await f.sql.end(); }
  }));
  it('requires an audited transition before changing a filed GST calendar, through either settings or profile', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request('/api/tax/gst-settings', 'PUT', saved);
      const profileDto = await f.request('/api/business-profile', 'GET');
      const [profile] = await f.db.select().from(businessProfiles).where(eq(businessProfiles.id, String(profileDto.id)));
      // A retained historic filing predates canonical calculation snapshots.
      await f.db.insert(taxReturns).values({ organisationId: profile.organisationId, userId: profile.userId, periodStart: '2026-04-10', periodEnd: '2026-05-31', returnType: 'GST', totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00', status: 'submitted', irdReference: 'LEGACY-001' });
      for (const patch of [{ gstFilingFrequency: 'six_monthly' }, { gstPeriodAnchor: 3 }, { gstRegisteredFrom: '2026-04-01' }]) {
        await f.request('/api/tax/gst-settings', 'PUT', { ...saved, ...patch }, 409);
      }
      await f.request('/api/business-profile', 'PUT', { name: profile.name, email: profile.email, gstFilingFrequency: 'six_monthly' }, 409);
      expect(await f.request('/api/tax/gst-settings', 'PUT', { ...saved, gstAccountingBasis: 'invoice' })).toMatchObject({ gstAccountingBasis: 'invoice' });
    } finally { await f.sql.end(); }
  }));
  it('allows an owner to explicitly complete unknown legacy GST metadata without rewriting a filed return', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      const profileDto = await f.request('/api/business-profile', 'GET');
      const [profile] = await f.db.select().from(businessProfiles).where(eq(businessProfiles.id, String(profileDto.id)));
      const [filed] = await f.db.insert(taxReturns).values({ organisationId: profile.organisationId, userId: profile.userId, periodStart: '2026-04-10', periodEnd: '2026-05-31', returnType: 'GST', totalSales: '0.00', totalPurchases: '0.00', gstOnSales: '0.00', gstOnPurchases: '0.00', netGst: '0.00', status: 'submitted', irdReference: 'LEGACY-CONFIRMED' }).returning();
      expect(await f.request('/api/tax/gst-settings', 'GET')).toMatchObject({ configured: false, gstRegisteredFrom: null, gstFilingFrequency: null });
      expect(await f.request('/api/tax/gst-settings', 'PUT', saved)).toMatchObject({ configured: true, gstRegisteredFrom: '2026-04-10', gstFilingFrequency: 'two_monthly' });
      expect(await f.request(`/api/tax-returns/${filed.id}`, 'GET')).toMatchObject({ status: 'submitted', periodStart: '2026-04-10', periodEnd: '2026-05-31', irdReference: 'LEGACY-CONFIRMED' });
    } finally { await f.sql.end(); }
  }));
  it('requires a date when explicitly registering an NZ profile but permits unrelated legacy edits and non-NZ tax identifiers', async () => withTestDb(async () => {
    const f = await settlementFixture();
    try {
      await f.request('/api/business-profile', 'PUT', { name: 'NZ business', email: 'owner@example.test', country: 'NZ', gstRegistrationStatus: 'registered' }, 400);
      await f.request('/api/business-profile', 'PUT', { name: 'NZ business', email: 'owner@example.test', country: 'NZ', gstRegistrationStatus: 'registered', gstRegisteredFrom: '2026-04-01', taxId: '49091850' });
      await f.request('/api/business-profile', 'PUT', { name: 'Renamed NZ business', email: 'owner@example.test' });
      await f.request('/api/business-profile', 'PUT', { name: 'AU business', email: 'owner@example.test', country: 'AU', taxId: 'ABN-example', gstRegistrationStatus: 'registered' });
    } finally { await f.sql.end(); }
  }));
});
