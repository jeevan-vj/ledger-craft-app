import { afterEach, expect, it, vi } from 'vitest';
import { invoicesApi } from './invoicesApi';

afterEach(() => vi.unstubAllGlobals());
it('keeps the public snapshotted buyer identifier for GST invoice rendering', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    invoice: { id: 'invoice', customerId: 'buyer', customerName: 'Buyer Ltd', customerEmail: '', customerDetails: { name: 'Buyer Ltd', email: '', address: '10 Buyer Street', phone: '021 555 0100', city: 'Auckland', state: null, zip: null, country: 'NZ' }, items: [], subtotal: '1000', taxAmount: '150', total: '1150' },
    templateName: 'classic', businessProfile: { name: 'Seller', email: 'seller@example.test', gstRegistrationStatus: 'registered', taxId: '49098576' },
  }), { status: 200 })));
  const result = await invoicesApi.getShared('test-token');
  expect(result?.invoiceData.customer).toMatchObject({ name: 'Buyer Ltd', phone: '021 555 0100', address: '10 Buyer Street', city: 'Auckland' });
});
