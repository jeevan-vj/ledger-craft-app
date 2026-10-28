import { describe, expect, it } from 'vitest';
import { publicLedgerOrganisationId } from './public-routes';

const orgId = '11111111-1111-4111-8111-111111111111';
const tokenId = '22222222-2222-4222-8222-222222222222';
const token = `${orgId}_${tokenId}`;

describe('public ledger routes', () => {
  it('routes only invoice and quote share reads, quote respond, and Stripe pay redirects to the tenant ledger', () => {
    expect(publicLedgerOrganisationId(`/api/public/invoices/${token}`)).toBe(orgId);
    expect(publicLedgerOrganisationId(`/api/public/quotes/${token}`)).toBe(orgId);
    expect(publicLedgerOrganisationId(`/api/public/quotes/${token}/respond`)).toBe(orgId);
    expect(publicLedgerOrganisationId(`/api/public/pay/${token}`)).toBe(orgId);
  });

  it('leaves every other public path on the session gate', () => {
    expect(publicLedgerOrganisationId('/api/public/quotes')).toBeNull();
    expect(publicLedgerOrganisationId(`/api/public/invoices/${token}/respond`)).toBeNull();
    expect(publicLedgerOrganisationId(`/api/public/quotes/${token}/respond/extra`)).toBeNull();
    expect(publicLedgerOrganisationId(`/api/public/quotes/${token}?download=1`)).toBeNull();
    expect(publicLedgerOrganisationId('/api/public/invoices/not-a-token')).toBeNull();
    expect(publicLedgerOrganisationId(`/api/quotes/${orgId}`)).toBeNull();
    expect(publicLedgerOrganisationId('/api/healthz')).toBeNull();
  });
});
