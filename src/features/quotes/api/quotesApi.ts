import type {
  ConvertQuoteResponse,
  CreateQuoteRequest,
  PublicQuoteResponse,
  PublicSharedQuote,
  QuoteDto,
  QuoteListResponse,
  RespondToQuoteRequest,
  ShareQuoteResponse,
  UpdateQuoteRequest,
} from '@ledgercraft/contracts';
import { toProfile } from '@/features/business-profile/api/businessProfileApi';
import { readApiFailure } from '@/lib/api/readApiError';
import type { AdditionalCharge, BusinessProfile, LineItem } from '@/types';
import type { Quote, QuoteCounts, QuoteKind, QuoteStatus } from '../types';

export class QuotesApiError extends Error {
  readonly requestId?: string;

  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'QuotesApiError';
    this.requestId = requestId;
  }
}

export class QuoteAlreadyRespondedError extends Error {
  readonly response: PublicQuoteResponse;

  constructor(response: PublicQuoteResponse) {
    super('This quote has already been answered');
    this.name = 'QuoteAlreadyRespondedError';
    this.response = response;
  }
}

export interface QuoteFormInput {
  customerId: string;
  date: string;
  expiryDate: string;
  kind?: QuoteKind;
  notes?: string | null;
  terms?: string | null;
  currency?: string;
  templateName?: string | null;
  taxRate?: number | null;
  taxInclusive?: boolean;
  discountType?: 'fixed' | 'percent';
  discountPercent?: number | null;
  discount?: number | null;
  additionalCharges?: number | null;
  additionalChargesList?: AdditionalCharge[];
  items: Array<Pick<LineItem, 'description' | 'quantity' | 'unit' | 'rate' | 'rateUnit'>>;
}

export interface PublicQuoteView {
  quote: Quote;
  templateName: string;
  businessProfile: BusinessProfile;
  status: QuoteStatus;
  expiryDate: string;
  respondedByName: string | null;
  responseNote: string | null;
  respondedAt: string | null;
}

function decimal(value: number | string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  return String(value);
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toLine(dto: QuoteDto['items'][number]): LineItem {
  return {
    id: dto.id,
    description: dto.description,
    quantity: toNumber(dto.quantity),
    unit: dto.unit,
    rate: toNumber(dto.rate),
    rateUnit: dto.rateUnit,
    tax: dto.tax == null ? null : toNumber(dto.tax),
    total: toNumber(dto.total),
  };
}

function toCharges(list: QuoteDto['additionalChargesList']): AdditionalCharge[] | undefined {
  return list?.map((charge) => ({
    id: charge.id,
    type: charge.type,
    label: charge.label,
    calculationType: charge.calculationType,
    amount: toNumber(charge.amount),
    description: charge.description,
    isActive: charge.isActive,
  }));
}

function toCounts(counts: QuoteListResponse['counts']): QuoteCounts {
  return {
    draft: counts.draft ?? 0,
    sent: counts.sent ?? 0,
    viewed: counts.viewed ?? 0,
    accepted: counts.accepted ?? 0,
    declined: counts.declined ?? 0,
    expired: counts.expired ?? 0,
    converted: counts.converted ?? 0,
  };
}

export function toQuote(dto: QuoteDto): Quote {
  return {
    id: dto.id,
    quoteNumber: dto.quoteNumber,
    kind: dto.kind,
    revision: dto.revision,
    customerId: dto.customerId,
    customerName: dto.customerName,
    date: dto.date,
    expiryDate: dto.expiryDate,
    subtotal: toNumber(dto.subtotal),
    taxAmount: toNumber(dto.taxAmount),
    taxRate: toNumber(dto.taxRate),
    taxInclusive: dto.taxInclusive,
    discountType: dto.discountType,
    discountPercent: dto.discountPercent == null ? null : toNumber(dto.discountPercent),
    discount: dto.discount == null ? null : toNumber(dto.discount),
    additionalCharges: dto.additionalCharges == null ? null : toNumber(dto.additionalCharges),
    additionalChargesList: toCharges(dto.additionalChargesList),
    additionalChargesTotal: toNumber(dto.additionalChargesTotal ?? dto.additionalCharges ?? 0),
    total: toNumber(dto.total),
    notes: dto.notes,
    terms: dto.terms,
    currency: dto.currency,
    templateName: dto.templateName,
    status: dto.status,
    sentAt: dto.sentAt,
    publicViewedAt: dto.publicViewedAt,
    respondedAt: dto.respondedAt,
    respondedByName: dto.respondedByName,
    responseNote: dto.responseNote,
    acceptedRevision: dto.acceptedRevision,
    convertedInvoiceId: dto.convertedInvoiceId,
    convertedInvoiceNumber: dto.convertedInvoiceNumber,
    items: dto.items.map(toLine),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toQuoteRequest(input: QuoteFormInput): CreateQuoteRequest {
  const discountType = input.discountType ?? 'fixed';
  return {
    customerId: input.customerId,
    date: input.date,
    expiryDate: input.expiryDate,
    kind: input.kind,
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    currency: input.currency || 'NZD',
    templateName: input.templateName ?? null,
    taxInclusive: input.taxInclusive ?? false,
    taxRate: decimal(input.taxRate ?? 0),
    discountType,
    discountPercent: discountType === 'percent' ? decimal(input.discountPercent) : null,
    discount: decimal(input.discount ?? 0),
    additionalCharges: decimal(input.additionalCharges ?? 0),
    additionalChargesList: input.additionalChargesList?.map((charge) => ({
      ...charge,
      amount: String(charge.amount),
    })),
    items: input.items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unit: item.unit || 'ea',
      rate: String(item.rate),
      rateUnit: item.rateUnit || item.unit || 'ea',
    })),
  };
}

export function quoteSharePath(token: string): string {
  return `/shared/quote/${encodeURIComponent(token)}`;
}

export function quoteShareUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${quoteSharePath(token)}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...((init?.headers ?? {}) as Record<string, string>),
    },
  });
  if (response.status === 204) return undefined as T;
  if (!response.ok) {
    const failure = await readApiFailure(response);
    throw new QuotesApiError(failure.message, failure.status, failure.code, failure.requestId);
  }
  return (await response.json()) as T;
}

function toUpdateRequest(input: QuoteFormInput): UpdateQuoteRequest {
  return toQuoteRequest(input);
}

export const quotesApi = {
  async list(): Promise<{ quotes: Quote[]; counts: QuoteCounts }> {
    const body = await request<QuoteListResponse>('/api/quotes');
    return {
      quotes: body.quotes.map(toQuote),
      counts: toCounts(body.counts),
    };
  },

  async get(id: string): Promise<Quote> {
    return toQuote(await request<QuoteDto>(`/api/quotes/${id}`));
  },

  async nextNumber(): Promise<string> {
    const body = await request<{ quoteNumber: string }>('/api/quotes/next-number');
    return body.quoteNumber;
  },

  async create(input: QuoteFormInput): Promise<Quote> {
    const dto = await request<QuoteDto>('/api/quotes', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(toQuoteRequest(input)),
    });
    return toQuote(dto);
  },

  async update(id: string, input: QuoteFormInput): Promise<Quote> {
    const dto = await request<QuoteDto>(`/api/quotes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(toUpdateRequest(input)),
    });
    return toQuote(dto);
  },

  async remove(id: string): Promise<void> {
    await request<void>(`/api/quotes/${id}`, { method: 'DELETE' });
  },

  async duplicate(id: string): Promise<Quote> {
    return toQuote(await request<QuoteDto>(`/api/quotes/${id}/duplicate`, { method: 'POST' }));
  },

  async revise(id: string): Promise<Quote> {
    return toQuote(await request<QuoteDto>(`/api/quotes/${id}/revise`, { method: 'POST' }));
  },

  async markSent(id: string): Promise<Quote> {
    return toQuote(await request<QuoteDto>(`/api/quotes/${id}/mark-sent`, { method: 'POST' }));
  },

  async setStatus(
    id: string,
    input: { status: 'accepted' | 'declined'; name?: string; note?: string },
  ): Promise<Quote> {
    return toQuote(await request<QuoteDto>(`/api/quotes/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(input),
    }));
  },

  async share(id: string, input: { templateName?: string } = {}): Promise<ShareQuoteResponse> {
    return request<ShareQuoteResponse>(`/api/quotes/${id}/share`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async convert(id: string, idempotencyKey?: string): Promise<ConvertQuoteResponse> {
    const key = idempotencyKey ?? crypto.randomUUID();
    const body = await request<ConvertQuoteResponse>(`/api/quotes/${id}/convert`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify({}),
    });
    return {
      quote: body.quote,
      invoice: body.invoice,
    };
  },

  async getPublic(token: string): Promise<PublicQuoteView> {
    const response = await fetch(`/api/public/quotes/${encodeURIComponent(token)}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      const failure = await readApiFailure(response);
      throw new QuotesApiError(failure.message, failure.status, failure.code, failure.requestId);
    }
    const dto = (await response.json()) as PublicSharedQuote;
    return {
      quote: toQuote(dto.quote),
      templateName: dto.templateName,
      businessProfile: toProfile(dto.businessProfile),
      status: dto.status,
      expiryDate: dto.expiryDate,
      respondedByName: dto.respondedByName,
      responseNote: dto.responseNote,
      respondedAt: dto.respondedAt,
    };
  },

  async respond(token: string, input: RespondToQuoteRequest): Promise<PublicQuoteResponse> {
    const response = await fetch(`/api/public/quotes/${encodeURIComponent(token)}/respond`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as
      | (PublicQuoteResponse & { response?: PublicQuoteResponse; error?: { code?: string; message?: string } })
      | null;
    if (response.status === 409 && payload?.response) {
      throw new QuoteAlreadyRespondedError(payload.response);
    }
    if (!response.ok) {
      const failure = await readApiFailure(new Response(JSON.stringify(payload ?? {}), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' },
      }));
      throw new QuotesApiError(failure.message, failure.status, failure.code ?? payload?.error?.code, failure.requestId);
    }
    return payload as PublicQuoteResponse;
  },
};
