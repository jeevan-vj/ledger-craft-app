import type { QuoteStatus } from './types';

export function canEditQuote(status: QuoteStatus): boolean {
  return status === 'draft';
}

export function canDeleteQuote(status: QuoteStatus): boolean {
  return status === 'draft';
}

export function canMarkQuoteSent(status: QuoteStatus): boolean {
  return status === 'draft';
}

export function canReviseQuote(status: QuoteStatus): boolean {
  return status === 'sent' || status === 'viewed' || status === 'declined' || status === 'expired';
}

export function canRespondToQuote(status: QuoteStatus): boolean {
  return status === 'sent' || status === 'viewed';
}

export function canConvertQuote(status: QuoteStatus): boolean {
  return status === 'accepted';
}

export function canShareQuote(status: QuoteStatus): boolean {
  return status !== 'converted';
}
