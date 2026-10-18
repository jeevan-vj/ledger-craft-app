import DecimalJs from 'decimal.js';
import type { Invoice } from '@/types/invoice';

export interface CustomerDraft {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  isVip: boolean;
}

export type CustomerDraftErrors = Partial<Record<'name' | 'email' | 'country', string>>;

export function validateCustomerDraft(draft: CustomerDraft): CustomerDraftErrors {
  const errors: CustomerDraftErrors = {};
  if (!draft.name.trim()) errors.name = 'Enter a customer name';
  if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (!draft.country.trim()) errors.country = 'Enter a country';
  return errors;
}

function normalized(draft: CustomerDraft) {
  return {
    ...draft,
    name: draft.name.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    address: draft.address.trim(),
    city: draft.city.trim(),
    state: draft.state.trim(),
    zip: draft.zip.trim(),
    country: draft.country.trim(),
  };
}

export function hasCustomerFormChanged(current: CustomerDraft, initial: CustomerDraft): boolean {
  return JSON.stringify(normalized(current)) !== JSON.stringify(normalized(initial));
}

export function summarizeCustomerInvoices(invoices: Invoice[]) {
  const billed = invoices.reduce((sum, invoice) => sum.plus(String(invoice.total ?? 0)), new DecimalJs(0));
  const paid = invoices.reduce((sum, invoice) => sum.plus(String(invoice.totalPaid ?? 0)), new DecimalJs(0));
  const outstanding = invoices
    .filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled')
    .reduce((sum, invoice) => sum.plus(String(invoice.balanceDue ?? Math.max(0, invoice.total - (invoice.totalPaid ?? 0)))), new DecimalJs(0));
  return {
    invoiceCount: invoices.length,
    billed: billed.toDecimalPlaces(2, DecimalJs.ROUND_HALF_UP).toFixed(2),
    paid: paid.toDecimalPlaces(2, DecimalJs.ROUND_HALF_UP).toFixed(2),
    outstanding: outstanding.toDecimalPlaces(2, DecimalJs.ROUND_HALF_UP).toFixed(2),
    currency: invoices[0]?.currency || 'NZD',
  };
}
