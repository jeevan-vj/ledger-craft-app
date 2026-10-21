import type { Invoice } from '@/types';
import type { Quote } from './types';

/** Adapts a quote onto the invoice preview shape. Totals stay the server values. */
export function quoteAsInvoicePreview(quote: Quote): Invoice {
  return {
    id: quote.id,
    invoiceNumber: quote.quoteNumber,
    customerId: quote.customerId,
    customer: {
      id: quote.customerId,
      name: quote.customerName || 'Customer',
      email: '',
      address: null,
      city: null,
      state: null,
      zip: null,
      country: '',
      phone: null,
    },
    date: quote.date,
    dueDate: quote.expiryDate,
    items: quote.items,
    subtotal: quote.subtotal,
    taxAmount: quote.taxAmount,
    discountType: quote.discountType,
    discountPercent: quote.discountPercent,
    discount: quote.discount,
    additionalCharges: quote.additionalCharges,
    additionalChargesList: quote.additionalChargesList,
    additionalChargesTotal: quote.additionalChargesTotal,
    total: quote.total,
    taxInclusive: quote.taxInclusive,
    status: 'draft',
    notes: quote.notes,
    terms: quote.terms,
    currency: quote.currency || 'NZD',
    templateName: quote.templateName ?? undefined,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  };
}
