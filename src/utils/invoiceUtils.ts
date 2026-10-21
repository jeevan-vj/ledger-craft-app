
import { Invoice, LineItem } from '@/types';
import { convertUnits, canConvert } from './unitConversion';

/**
 * Calculates the total for a single line item with unit conversion support
 */
export const calculateLineTotal = (
  quantity: number,
  quantityUnit: string,
  rate: number,
  rateUnit: string
): number => {
  // If units are the same or conversion is not possible, use simple multiplication
  if (quantityUnit === rateUnit || !canConvert(quantityUnit, rateUnit)) {
    return Math.round(quantity * rate * 100) / 100;
  }
  
  // Convert quantity to rate unit and calculate
  const convertedQuantity = convertUnits(quantity, quantityUnit, rateUnit);
  return Math.round(convertedQuantity * rate * 100) / 100;
};

/**
 * Calculates the subtotal for an array of line items
 */
export const calculateSubtotal = (items: LineItem[]): number => {
  return items.reduce((sum, item) => sum + item.total, 0);
};

/**
 * Calculates the tax amount for an invoice based on its line items
 */
export const calculateTaxAmount = (items: LineItem[]): number => {
  return items.reduce((sum, item) => {
    const taxRate = item.tax || 0;
    return sum + (item.rate * item.quantity * taxRate) / 100;
  }, 0);
};

/**
 * Calculates the total amount for an invoice including subtotal, tax, and discount
 */
export const calculateTotal = (subtotal: number, taxAmount: number, discount = 0): number => {
  return subtotal + taxAmount - discount;
};

/**
 * Generates a unique invoice number
 */
export const generateInvoiceNumber = (): string => {
  const prefix = 'INV';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * Formats a date to YYYY-MM-DD using local timezone
 */
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Formats currency based on locale and currency code
 * Handles empty or invalid currency codes by defaulting to USD
 */
export const formatCurrency = (amount: number, currencyCode = 'USD', locale = 'en-US'): string => {
  // Default to USD if currency code is empty or invalid
  const currency = currencyCode && typeof currencyCode === 'string' && currencyCode.trim() ? currencyCode : 'USD';
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  } catch (error) {
    // Fallback in case of any other error
    console.warn(`Error formatting currency: ${error}. Using USD as fallback.`);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }
};

/**
 * Gets status color based on invoice status
 */
export const getStatusColor = (status: Invoice['status']): string => {
  const statusColors = {
    draft: 'bg-gray-200 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
  };
  
  return statusColors[status];
};

/**
 * Label for an invoice-level discount row.
 */
export const invoiceDiscountLabel = (invoice: Pick<Invoice, 'discountType' | 'discountPercent'>): string => {
  if (invoice.discountType === 'percent' && invoice.discountPercent != null) {
    const percent = Number(invoice.discountPercent);
    return `Discount (${percent}%)`;
  }
  return 'Discount';
};

/** GST percent shown on preview/PDF. Inclusive prices use the exclusive subtotal; exclusive prices use subtotal − discount. */
export const invoiceDisplayTaxRate = (
  invoice: Pick<Invoice, 'subtotal' | 'taxAmount' | 'discount'> & { taxInclusive?: boolean },
): string => {
  const discount = Number(invoice.discount ?? 0);
  const taxable = invoice.taxInclusive === true
    ? Number(invoice.subtotal)
    : Number(invoice.subtotal) - discount;
  if (taxable <= 0) return '0';
  return ((Number(invoice.taxAmount) / taxable) * 100).toFixed(2);
};
export const isInvoiceOverdue = (invoice: Invoice): boolean => {
  if (invoice.status === 'paid') return false;
  
  const today = new Date();
  const dueDate = new Date(invoice.dueDate);
  
  return today > dueDate;
};

/**
 * Updates invoice status based on payment and due date
 */
export const updateInvoiceStatus = (invoice: Invoice): Invoice['status'] => {
  if (invoice.status === 'paid') return 'paid';
  
  return isInvoiceOverdue(invoice) ? 'overdue' : invoice.status;
};

/**
 * Generates an invoice number based on business profile settings
 */
export const generateNextInvoiceNumber = (format: string | undefined | null, sequence: number | undefined | null): string => {
  if (!format) {
    return `INV-${Date.now()}`; // Fallback format
  }

  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const seq = sequence ? String(sequence).padStart(4, '0') : '0001';

  // Replace placeholders in the format string
  return format
    .replace('{YYYY}', year.toString())
    .replace('{MM}', month)
    .replace('{SEQ}', seq);
};
