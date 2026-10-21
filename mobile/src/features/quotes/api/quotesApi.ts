import { apiRequest, AuthApiError } from '@/features/auth/api/http';
import {
  toBusinessProfile,
  type MobileBusinessProfileDto,
} from '@/features/business-profile/api/businessProfileApi';
import { decimalText } from '@/features/quotes/quoteModel';
import type { BusinessProfile, LineItem } from '@/types/invoice';
import type { Quote, QuoteCharge, QuoteKind, QuoteListResult, QuoteStatus } from '@/types/quote';

export interface QuoteWriteInput {
  customerId: string;
  date: string;
  expiryDate: string;
  kind: QuoteKind;
  notes?: string | null;
  terms?: string | null;
  currency?: string;
  templateName?: string | null;
  taxInclusive: boolean;
  taxRate: string;
  discountType?: 'fixed' | 'percent';
  discountPercent?: string | null;
  discount?: string | null;
  additionalCharges?: string | null;
  additionalChargesList?: QuoteCharge[];
  items: LineItem[];
}

export interface PublicQuoteSnapshot {
  quote: Quote;
  templateName: string;
  businessProfile: BusinessProfile;
  status: QuoteStatus;
  expiryDate: string;
  respondedByName: string | null;
  responseNote: string | null;
  respondedAt: string | null;
}

interface PublicQuoteDto {
  quote: Quote;
  templateName: string;
  businessProfile: MobileBusinessProfileDto;
  status: QuoteStatus;
  expiryDate: string;
  respondedByName: string | null;
  responseNote: string | null;
  respondedAt: string | null;
}

export interface ConvertQuoteResult {
  quote: Quote;
  invoiceId: string;
  invoiceNumber: string;
}

function quotePath(id: string): string {
  return `/api/quotes/${encodeURIComponent(id)}`;
}

function toBody(input: QuoteWriteInput): Record<string, unknown> {
  return {
    customerId: input.customerId,
    date: input.date,
    expiryDate: input.expiryDate,
    kind: input.kind,
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    currency: input.currency || 'NZD',
    templateName: input.templateName ?? null,
    taxInclusive: input.taxInclusive,
    taxRate: input.taxRate,
    ...(input.discountType ? { discountType: input.discountType } : {}),
    ...(input.discountPercent !== undefined ? { discountPercent: input.discountPercent } : {}),
    ...(input.discount !== undefined ? { discount: input.discount } : {}),
    ...(input.additionalCharges !== undefined ? { additionalCharges: input.additionalCharges } : {}),
    ...(input.additionalChargesList !== undefined ? { additionalChargesList: input.additionalChargesList } : {}),
    items: input.items.map((item) => ({
      description: item.description.trim(),
      quantity: decimalText(item.quantity),
      unit: item.unit || 'ea',
      rate: decimalText(item.rate),
      rateUnit: item.unit || 'ea',
    })),
  };
}

export const quotesApi = {
  async list(query?: { status?: QuoteStatus; customerId?: string; q?: string }): Promise<QuoteListResult> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.customerId) params.set('customerId', query.customerId);
    if (query?.q) params.set('q', query.q);
    const text = params.toString();
    return apiRequest<QuoteListResult>(`/api/quotes${text ? `?${text}` : ''}`);
  },

  async get(id: string): Promise<Quote> {
    return apiRequest<Quote>(quotePath(id));
  },

  async nextNumber(): Promise<string> {
    const body = await apiRequest<{ quoteNumber: string }>('/api/quotes/next-number');
    return body.quoteNumber;
  },

  async create(input: QuoteWriteInput, idempotencyKey: string): Promise<Quote> {
    return apiRequest<Quote>('/api/quotes', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(toBody(input)),
    });
  },

  async update(id: string, input: QuoteWriteInput): Promise<Quote> {
    return apiRequest<Quote>(quotePath(id), {
      method: 'PATCH',
      body: JSON.stringify(toBody(input)),
    });
  },

  async remove(id: string): Promise<void> {
    await apiRequest<void>(quotePath(id), { method: 'DELETE' });
  },

  async duplicate(id: string): Promise<Quote> {
    return apiRequest<Quote>(`${quotePath(id)}/duplicate`, { method: 'POST' });
  },

  async revise(id: string): Promise<Quote> {
    return apiRequest<Quote>(`${quotePath(id)}/revise`, { method: 'POST' });
  },

  async markSent(id: string): Promise<Quote> {
    return apiRequest<Quote>(`${quotePath(id)}/mark-sent`, { method: 'POST' });
  },

  async setStatus(
    id: string,
    input: { status: 'accepted' | 'declined'; name?: string; note?: string },
  ): Promise<Quote> {
    return apiRequest<Quote>(`${quotePath(id)}/status`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async share(id: string, templateName?: string | null): Promise<{ shareToken: string }> {
    return apiRequest<{ shareToken: string }>(`${quotePath(id)}/share`, {
      method: 'POST',
      body: JSON.stringify(templateName ? { templateName } : {}),
    });
  },

  async convert(id: string, idempotencyKey: string): Promise<ConvertQuoteResult> {
    const body = await apiRequest<{ quote: Quote; invoice: { id: string; invoiceNumber: string } }>(
      `${quotePath(id)}/convert`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({}),
      },
    );
    return {
      quote: body.quote,
      invoiceId: body.invoice.id,
      invoiceNumber: body.invoice.invoiceNumber,
    };
  },

  async getPublic(token: string): Promise<PublicQuoteSnapshot | null> {
    try {
      const dto = await apiRequest<PublicQuoteDto>(`/api/public/quotes/${encodeURIComponent(token)}`);
      return {
        quote: dto.quote,
        templateName: dto.templateName,
        businessProfile: toBusinessProfile(dto.businessProfile),
        status: dto.status,
        expiryDate: dto.expiryDate,
        respondedByName: dto.respondedByName,
        responseNote: dto.responseNote,
        respondedAt: dto.respondedAt,
      };
    } catch (error) {
      if (error instanceof AuthApiError && (error.status === 404 || error.status === 410)) return null;
      throw error;
    }
  },

  async respond(
    token: string,
    input: { action: 'accept' | 'decline'; name: string; note?: string },
  ): Promise<void> {
    await apiRequest(`/api/public/quotes/${encodeURIComponent(token)}/respond`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
