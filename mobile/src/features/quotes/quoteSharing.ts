import type { QuoteKind } from '@/types/quote';
import { quoteKindLabel } from './quoteModel';

const DEFAULT_WEB_ORIGIN = 'https://easybiz.iamjeevan.com';

export function publicQuotePath(shareToken: string): string {
  return `shared/quote/${encodeURIComponent(shareToken)}`;
}

export function buildPublicQuoteUrl(shareToken: string): string {
  const origin = (process.env.EXPO_PUBLIC_WEB_URL ?? DEFAULT_WEB_ORIGIN).replace(/\/$/, '');
  return `${origin}/${publicQuotePath(shareToken)}`;
}

export function buildQuoteShareMessage(input: {
  kind?: QuoteKind;
  quoteNumber: string;
  businessName?: string | null;
  url: string;
}): string {
  const label = quoteKindLabel(input.kind ?? 'quote');
  const sender = input.businessName?.trim();
  const title = sender
    ? `${label} ${input.quoteNumber} from ${sender}`
    : `${label} ${input.quoteNumber}`;
  return `${title}\n${input.url}`;
}
