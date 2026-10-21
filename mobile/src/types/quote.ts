export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'converted';

export type QuoteKind = 'quote' | 'estimate';

export interface QuoteCharge {
  id: string;
  type: 'delivery' | 'handling' | 'rush' | 'service' | 'processing' | 'international' | 'setup' | 'administrative' | 'custom';
  label: string;
  calculationType: 'fixed' | 'percentage';
  amount: string;
  description?: string;
  isActive: boolean;
}

export interface QuoteLine {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  rateUnit: string;
  tax: string | null;
  total: string;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  kind: QuoteKind;
  revision: number;
  customerId: string;
  customerName: string | null;
  date: string;
  expiryDate: string;
  subtotal: string;
  taxAmount: string;
  taxRate: string;
  taxInclusive: boolean;
  discountType: 'fixed' | 'percent';
  discountPercent: string | null;
  discount: string | null;
  additionalCharges: string | null;
  additionalChargesList?: QuoteCharge[];
  additionalChargesTotal?: string;
  total: string;
  notes: string | null;
  terms: string | null;
  currency: string;
  templateName: string | null;
  status: QuoteStatus;
  sentAt: string | null;
  publicViewedAt: string | null;
  respondedAt: string | null;
  respondedByName: string | null;
  responseNote: string | null;
  acceptedRevision: number | null;
  convertedInvoiceId: string | null;
  convertedInvoiceNumber: string | null;
  items: QuoteLine[];
  createdAt: string;
  updatedAt: string;
}

export interface QuoteCounts {
  draft: number;
  sent: number;
  viewed: number;
  accepted: number;
  declined: number;
  expired: number;
  converted: number;
}

export interface QuoteListResult {
  quotes: Quote[];
  counts: QuoteCounts;
}

export const EMPTY_QUOTE_COUNTS: QuoteCounts = {
  draft: 0,
  sent: 0,
  viewed: 0,
  accepted: 0,
  declined: 0,
  expired: 0,
  converted: 0,
};
