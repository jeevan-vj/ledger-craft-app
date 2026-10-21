import type { AdditionalCharge, LineItem } from '@/types';

export type QuoteKind = 'quote' | 'estimate';

export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'converted';

export interface Quote {
  id: string;
  quoteNumber: string;
  kind: QuoteKind;
  revision: number;
  customerId: string;
  customerName: string | null;
  date: string;
  expiryDate: string;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  taxInclusive: boolean;
  discountType: 'fixed' | 'percent';
  discountPercent: number | null;
  discount: number | null;
  additionalCharges: number | null;
  additionalChargesList?: AdditionalCharge[];
  additionalChargesTotal: number;
  total: number;
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
  items: LineItem[];
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

export const QUOTE_STATUSES: QuoteStatus[] = [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'converted',
];

export function emptyQuoteCounts(): QuoteCounts {
  return {
    draft: 0,
    sent: 0,
    viewed: 0,
    accepted: 0,
    declined: 0,
    expired: 0,
    converted: 0,
  };
}

export function quoteNoun(kind: QuoteKind): 'Quote' | 'Estimate' {
  return kind === 'estimate' ? 'Estimate' : 'Quote';
}
