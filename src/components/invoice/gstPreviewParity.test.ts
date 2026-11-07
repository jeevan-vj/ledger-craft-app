import { expect, it } from 'vitest';
import { previewQuoteTotals } from '@/features/quotes/quoteTotals';
import { gstBuyerInformationIssue } from './gstBuyerInformation';
import type { BusinessProfile, Customer } from '@/types';

it.each([true, false])('preserves explicit line-specific GST when the invoice default is enabled=%s', (taxEnabled) => {
  const preview = previewQuoteTotals({ items: [
    { id: 'a', description: 'First service', quantity: 1, rate: 100, total: 105, unit: 'ea', rateUnit: 'ea', taxes: [{ id: 'a-gst', name: 'GST', rate: 5 }] },
    { id: 'b', description: 'Second service', quantity: 1, rate: 100, total: 115, unit: 'ea', rateUnit: 'ea', taxes: [{ id: 'b-gst', name: 'GST', rate: 15 }] },
  ], taxInclusive: false, taxEnabled, taxRate: 15, discountType: 'fixed', discountValue: 0, discountPercent: 0, additionalCharges: 0 });
  expect(preview).toMatchObject({ subtotal: '200.00', taxAmount: '20.00', total: '220.00' });
});
it('uses a known server NZD snapshot for a foreign-currency buyer threshold', () => {
  const profile = { name: 'Kauri', email: 'owner@example.test', country: 'NZ', address: null, city: null, state: null, zip: null, gstRegistrationStatus: 'registered', gstRegisteredFrom: '2026-04-01' } satisfies BusinessProfile;
  const customer = { id: 'buyer', name: 'Buyer', email: '', country: 'NZ', address: null, city: null, state: null, zip: null } satisfies Customer;
  expect(gstBuyerInformationIssue(profile, customer, 'USD', '700.00', '2026-10-01', { baseCurrency: 'NZD', baseTotal: '1120.00' })).toMatch(/buyer.*identifier/i);
  expect(gstBuyerInformationIssue(profile, customer, 'USD', '600.00', '2026-10-01', { baseCurrency: 'NZD', baseTotal: '960.00' })).toBeNull();
});
