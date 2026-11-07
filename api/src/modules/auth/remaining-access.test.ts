import { it, expect } from 'vitest';
import { permissionForRequest } from './authorize-request';
import { publicLedgerOrganisationId } from '../../cloudflare/public-routes';
import { scrubText, toRouteTemplate } from '../../observability/scrub';
it('protects new collections, bank-feed and Stripe operations with existing least privileges', () => {
 expect(permissionForRequest('POST', '/api/customer-statements/send-bulk')).toBe('banking.write');
 expect(permissionForRequest('GET', '/api/payment-reminders/settings')).toBe('settings.read');
 expect(permissionForRequest('PUT', '/api/payment-reminders/settings')).toBe('settings.write');
 expect(permissionForRequest('PUT', '/api/payment-reminders/invoices/123')).toBe('banking.write');
 expect(permissionForRequest('POST', '/api/bank-feeds/akahu/sync')).toBe('banking.write');
 expect(permissionForRequest('POST', '/api/payments/123/stripe/refund')).toBe('payments.manage');
 expect(permissionForRequest('GET', '/api/payments/stripe/balance')).toBe('payments.manage');
});
it('only routes exact statement bearer reads publicly and removes tokens from diagnostics', () => {
 const org = '11111111-1111-4111-8111-111111111111'; const token = `${org}.${'a'.repeat(64)}`;
 expect(publicLedgerOrganisationId(`/api/public/customer-statements/${token}`)).toBe(org);
 expect(publicLedgerOrganisationId(`/api/public/customer-statements/${token}/extra`)).toBeNull();
 expect(publicLedgerOrganisationId(`/api/public/customer-statements/${org}.bad`)).toBeNull();
 expect(scrubText(`https://example.test/shared/statement/${token}`)).not.toContain(token);
 expect(toRouteTemplate(`/api/public/customer-statements/${token}`)).not.toContain(token);
});
