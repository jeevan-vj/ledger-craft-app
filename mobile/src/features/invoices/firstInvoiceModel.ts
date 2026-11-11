import type { Invoice, LineItem } from '@/types/invoice';
import { currencyForCountry, getDefaultTaxRate } from '@/utils/countryTaxDefaults';

export type GstRegistrationStatus = 'unknown' | 'registered' | 'not_registered';

export interface NewInvoiceDefaultsInput {
  country?: string | null;
  gstRegistrationStatus?: GstRegistrationStatus | null;
  defaultTaxRate?: number | null;
}

export interface NewInvoiceDefaults {
  currency: string;
  taxEnabled: boolean;
  taxRate: number;
}

export interface InvoiceTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface InvoiceDates {
  date: string;
  dueDate: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export function newInvoiceDefaults(profile: NewInvoiceDefaultsInput | null | undefined): NewInvoiceDefaults {
  const country = profile?.country?.trim() || 'New Zealand';
  const currency = currencyForCountry(country);
  if (profile?.gstRegistrationStatus !== 'registered') {
    return { currency, taxEnabled: false, taxRate: 0 };
  }
  const profileRate = typeof profile.defaultTaxRate === 'number' ? profile.defaultTaxRate : 0;
  const taxRate = profileRate > 0 ? profileRate : (getDefaultTaxRate(country) ?? 0);
  return { currency, taxEnabled: taxRate > 0, taxRate };
}

export function matchedCustomerId(
  customers: readonly { id: string }[],
  requestedId?: string | null,
): string | null {
  if (!requestedId) return null;
  return customers.some((customer) => customer.id === requestedId) ? requestedId : null;
}

export function customerStepError(input: { selectedId?: string | null; name: string; email: string }): string | null {
  if (input.selectedId) return null;
  if (input.name.trim().length < 2) return 'Enter the customer name.';
  const email = input.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) return 'Enter a valid email or leave it blank.';
  return null;
}

export function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (!MONEY_PATTERN.test(trimmed)) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export function lineStepError(description: string, amount: string): string | null {
  if (description.trim().length < 2) return 'Describe what you are charging for.';
  if (parseMoneyInput(amount) == null) return 'Enter an amount greater than zero.';
  return null;
}

export function invoiceTotals(subtotal: number, taxEnabled: boolean, taxRate: number): InvoiceTotals {
  const subtotalCents = Math.round(subtotal * 100);
  const taxCents = taxEnabled ? Math.round((subtotalCents * taxRate) / 100) : 0;
  return {
    subtotal: subtotalCents / 100,
    taxAmount: taxCents / 100,
    total: (subtotalCents + taxCents) / 100,
  };
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function defaultInvoiceDates(now = new Date()): InvoiceDates {
  const due = new Date(now);
  due.setDate(due.getDate() + 30);
  return { date: localIsoDate(now), dueDate: localIsoDate(due) };
}

export function buildInvoiceDraft(input: {
  invoiceNumber: string;
  customerId: string;
  description: string;
  amount: number;
  currency: string;
  taxEnabled: boolean;
  taxRate: number;
  salesTaxCode?: 'standard_15' | 'zero_rated' | 'exempt';
  notes?: string | null;
  terms?: string | null;
  dates: InvoiceDates;
}): { invoice: Partial<Invoice>; lineItems: LineItem[] } {
  const totals = invoiceTotals(input.amount, input.taxEnabled, input.taxRate);
  const taxCode = input.salesTaxCode ?? (input.taxEnabled && input.taxRate === 15 ? 'standard_15' : undefined);
  return {
    invoice: {
      invoiceNumber: input.invoiceNumber,
      customerId: input.customerId,
      date: input.dates.date,
      dueDate: input.dates.dueDate,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: input.notes?.trim() || '',
      terms: input.terms?.trim() || '',
      currency: input.currency,
      templateName: 'classic',
      status: 'draft',
    },
    lineItems: [{
      id: '1',
      description: input.description.trim(),
      quantity: 1,
      unit: 'each',
      rate: input.amount,
      total: input.amount,
      ...(taxCode ? { taxCode } : {}),
      ...(input.taxEnabled ? {} : { taxes: [] }),
    }],
  };
}
