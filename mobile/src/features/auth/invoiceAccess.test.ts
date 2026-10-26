import { canImportInvoices, canWriteInvoices } from './invoiceAccess';

describe('invoice permissions', () => {
  it('shows import only for the explicit invoices.import permission', () => {
    expect(canImportInvoices(['invoices.import'])).toBe(true);
    expect(canImportInvoices(['invoices.read', 'invoices.write'])).toBe(false);
    expect(canImportInvoices(undefined)).toBe(false);
  });

  it('keeps invoice write separate from import', () => {
    expect(canWriteInvoices(['invoices.write'])).toBe(true);
    expect(canWriteInvoices(['invoices.import'])).toBe(false);
  });
});
