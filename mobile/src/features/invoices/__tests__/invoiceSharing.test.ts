import {
  buildInvoiceShareMessage,
  buildPublicInvoiceUrl,
  publicInvoicePath,
} from '../invoiceSharing';

describe('mobile invoice sharing links', () => {
  it('builds one canonical HTTPS URL with an encoded token', () => {
    expect(buildPublicInvoiceUrl('org/token with spaces')).toBe(
      'https://easybiz.iamjeevan.com/shared/invoice/org%2Ftoken%20with%20spaces',
    );
    expect(publicInvoicePath('org/token')).toBe('shared/invoice/org%2Ftoken');
  });

  it('includes invoice and business context in the native share message', () => {
    expect(
      buildInvoiceShareMessage({
        invoiceNumber: 'INV-42',
        businessName: 'Harbour Studio',
        url: 'https://easybiz.iamjeevan.com/shared/invoice/token',
      }),
    ).toBe(
      'Invoice INV-42 from Harbour Studio\nhttps://easybiz.iamjeevan.com/shared/invoice/token',
    );
  });
});
