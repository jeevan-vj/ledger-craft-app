import type {
  CreateInvoiceRequest,
  CreateShareInvoiceRequest,
  InvoiceShareListResponse,
  InvoiceDto,
  InvoiceAttachmentDto,
  InvoiceHistoryDto,
  ImportInvoicesRequest,
  ImportInvoicesResponse,
  PublicSharedInvoice,
  RemindInvoiceRequest,
  SendInvoiceRequest,
  ShareInvoiceResponse,
  UpdateInvoiceRequest,
} from '@ledgercraft/contracts';
import type { Invoice, LineItem } from '@/types';
import { readApiFailure } from '@/lib/api/readApiError';
import { toProfile } from '@/features/business-profile/api/businessProfileApi';

export function invoicesApiEnabled(): boolean {
  return import.meta.env.VITE_INVOICES_API !== 'false';
}

export class InvoicesApiError extends Error {
  readonly requestId?: string;

  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'InvoicesApiError';
    this.requestId = requestId;
  }
}

function money(value: number | string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  return String(value);
}

type InvoiceLineInput = Pick<
  LineItem,
  | 'description'
  | 'quantity'
  | 'unit'
  | 'rate'
  | 'rateUnit'
  | 'discountType'
  | 'discountValue'
  | 'taxes'
>;

function writableStatus(status: Invoice['status'] | undefined) {
  return status === 'cancelled' ? undefined : status;
}

function toLine(dto: InvoiceDto['items'][number]): LineItem {
  return {
    id: dto.id,
    description: dto.description,
    quantity: Number(dto.quantity),
    unit: dto.unit,
    rate: Number(dto.rate),
    rateUnit: dto.rateUnit,
    tax: dto.tax == null ? null : Number(dto.tax),
    total: Number(dto.total),
    discountType: dto.discountType,
    discountValue: dto.discountValue == null ? null : Number(dto.discountValue),
    discountAmount: Number(dto.discountAmount ?? 0),
    taxes: dto.taxes?.map((tax) => ({
      id: tax.id ?? crypto.randomUUID(),
      name: tax.name ?? 'Tax',
      rate: Number(tax.rate),
    })),
  };
}

function toInvoice(dto: InvoiceDto): Invoice {
  return {
    id: dto.id,
    invoiceNumber: dto.invoiceNumber,
    externalId: dto.externalId,
    customerId: dto.customerId,
    customer: dto.customerName
      ? {
          id: dto.customerId,
          name: dto.customerName,
          email: '',
          address: null,
          city: null,
          state: null,
          zip: null,
          country: 'NZ',
          phone: null,
          isVip: false,
          tags: [],
        }
      : undefined,
    date: dto.date,
    dueDate: dto.dueDate,
    paymentTermDays: dto.paymentTermDays,
    items: dto.items.map(toLine),
    subtotal: Number(dto.subtotal),
    taxAmount: Number(dto.taxAmount),
    discountType: dto.discountType,
    discountPercent: dto.discountPercent == null ? null : Number(dto.discountPercent),
    discount: dto.discount == null ? null : Number(dto.discount),
    additionalCharges: dto.additionalCharges == null ? null : Number(dto.additionalCharges),
    additionalChargesList: dto.additionalChargesList?.map((charge) => ({
      id: charge.id ?? crypto.randomUUID(),
      type: charge.type ?? 'custom',
      label: charge.label ?? 'Additional charge',
      calculationType: charge.calculationType ?? 'fixed',
      amount: Number(charge.amount),
      description: charge.description,
      isActive: charge.isActive ?? true,
    })),
    additionalChargesTotal: Number(dto.additionalChargesTotal ?? dto.additionalCharges ?? 0),
    total: Number(dto.total),
    totalPaid: Number(dto.totalPaid),
    balanceDue: Number(dto.balanceDue),
    paymentStatus: dto.paymentStatus as Invoice['paymentStatus'],
    taxInclusive: dto.taxInclusive,
    status: dto.status,
    notes: dto.notes,
    terms: dto.terms,
    currency: dto.currency,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    archivedAt: dto.archivedAt,
    sourceQuoteId: dto.sourceQuoteId,
    sourceQuoteNumber: dto.sourceQuoteNumber,
  };
}

export function toCreateInvoiceRequest(
  invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>,
  lineItems: InvoiceLineInput[],
): CreateInvoiceRequest {
  const taxableBase = Number(invoice.subtotal) - Number(invoice.discount ?? 0);
  const taxRate =
    invoice.taxAmount && taxableBase > 0
      ? String(Math.round((invoice.taxAmount / taxableBase) * 10000) / 100)
      : '0';
  return {
    customerId: invoice.customerId,
    date: invoice.date,
    dueDate: invoice.dueDate,
    notes: invoice.notes ?? null,
    terms: invoice.terms ?? null,
    currency: invoice.currency || 'NZD',
    taxInclusive: false,
    taxRate,
    paymentTermDays: invoice.paymentTermDays ?? undefined,
    discountType: invoice.discountType,
    discountPercent: money(invoice.discountPercent),
    discount: money(invoice.discount),
    additionalCharges: money(invoice.additionalCharges),
    additionalChargesList: invoice.additionalChargesList?.map(charge => ({ ...charge, amount: String(charge.amount) })),
    status: writableStatus(invoice.status),
    items: lineItems.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unit: item.unit || 'ea',
      rate: String(item.rate),
      rateUnit: item.rateUnit || item.unit || 'ea',
      discountType: item.discountType,
      discountValue: money(item.discountValue),
      taxes: item.taxes?.map((tax) => ({ ...tax, rate: String(tax.rate) })),
    })),
  };
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
    throw new InvoicesApiError(failure.message, failure.status, failure.code, failure.requestId);
  }
  return (await response.json()) as T;
}

export const invoicesApi = {
  async list(): Promise<Invoice[]> {
    const body = await request<{ invoices: InvoiceDto[] }>('/api/invoices');
    return body.invoices.map(toInvoice);
  },

  async get(id: string): Promise<Invoice | null> {
    try {
      return toInvoice(await request<InvoiceDto>(`/api/invoices/${id}`));
    } catch (error) {
      if (error instanceof InvoicesApiError && error.status === 404) return null;
      throw error;
    }
  },

  async create(
    invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>,
    lineItems: InvoiceLineInput[],
  ): Promise<Invoice> {
    const dto = await request<InvoiceDto>('/api/invoices', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(toCreateInvoiceRequest(invoice, lineItems)),
    });
    return toInvoice(dto);
  },

  async updateStatus(id: string, status: Exclude<Invoice['status'], 'cancelled'>): Promise<Invoice> {
    const input: UpdateInvoiceRequest = { status };
    return toInvoice(
      await request<InvoiceDto>(`/api/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  },

  async update(
    id: string,
    invoice: Partial<Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>>,
    lineItems?: InvoiceLineInput[],
  ): Promise<Invoice> {
    const input: UpdateInvoiceRequest = {
      notes: invoice.notes,
      terms: invoice.terms,
      date: invoice.date,
      dueDate: invoice.dueDate,
      paymentTermDays: invoice.paymentTermDays,
      discountType: invoice.discountType,
      discountPercent: money(invoice.discountPercent),
      discount: money(invoice.discount),
      additionalCharges: money(invoice.additionalCharges),
      additionalChargesList: invoice.additionalChargesList?.map(charge => ({ ...charge, amount: String(charge.amount) })),
      status: writableStatus(invoice.status),
      items: lineItems && lineItems.length > 0
        ? lineItems.map((item) => ({
            description: item.description,
            quantity: String(item.quantity),
            unit: item.unit || 'ea',
            rate: String(item.rate),
            rateUnit: item.rateUnit || item.unit || 'ea',
            discountType: item.discountType,
            discountValue: money(item.discountValue),
            taxes: item.taxes?.map((tax) => ({ ...tax, rate: String(tax.rate) })),
          }))
        : undefined,
    };
    return toInvoice(
      await request<InvoiceDto>(`/api/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  },

  async send(id: string, input: SendInvoiceRequest = {}): Promise<Invoice> {
    return toInvoice(
      await request<InvoiceDto>(`/api/invoices/${id}/send`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async remind(id: string, input: RemindInvoiceRequest): Promise<Invoice> {
    return toInvoice(
      await request<InvoiceDto>(`/api/invoices/${id}/remind`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  },

  async shares(id: string): Promise<ShareInvoiceResponse[]> {
    return (await request<InvoiceShareListResponse>(`/api/invoices/${id}/shares`)).shares;
  },

  async share(
    id: string,
    input: CreateShareInvoiceRequest,
  ): Promise<ShareInvoiceResponse> {
    return request<ShareInvoiceResponse>(`/api/invoices/${id}/share`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async cancel(id: string, reason?: string): Promise<Invoice> {
    return toInvoice(await request<InvoiceDto>(`/api/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }));
  },

  async restore(id: string, reason?: string): Promise<Invoice> {
    return toInvoice(await request<InvoiceDto>(`/api/invoices/${id}/restore`, { method: 'POST', body: JSON.stringify({ reason }) }));
  },

  async archive(id: string): Promise<Invoice> {
    return toInvoice(await request<InvoiceDto>(`/api/invoices/${id}`, { method: 'DELETE' }));
  },

  async duplicate(id: string): Promise<Invoice> {
    return toInvoice(await request<InvoiceDto>(`/api/invoices/${id}/duplicate`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }));
  },

  async history(id: string): Promise<InvoiceHistoryDto[]> {
    return (await request<{ history: InvoiceHistoryDto[] }>(`/api/invoices/${id}/history`)).history;
  },

  async attachments(id: string): Promise<InvoiceAttachmentDto[]> {
    return (await request<{ attachments: InvoiceAttachmentDto[] }>(`/api/invoices/${id}/attachments`)).attachments;
  },

  async attach(id: string, input: { objectKey: string; filename: string; contentType: string; size: number }): Promise<InvoiceAttachmentDto> {
    return request<InvoiceAttachmentDto>(`/api/invoices/${id}/attachments`, { method: 'POST', body: JSON.stringify(input) });
  },

  async removeAttachment(id: string, attachmentId: string): Promise<void> {
    return request<void>(`/api/invoices/${id}/attachments/${attachmentId}`, { method: 'DELETE' });
  },

  async importInvoices(input: ImportInvoicesRequest): Promise<ImportInvoicesResponse> {
    return request<ImportInvoicesResponse>('/api/invoices-import', { method: 'POST', body: JSON.stringify(input) });
  },

  exportUrl: '/api/invoices-export.csv',

  async getShared(token: string): Promise<{
    invoiceData: Invoice;
    templateData: { templateName: string; businessProfile: ReturnType<typeof toProfile>; attachments: InvoiceAttachmentDto[] };
  } | null> {
    try {
      const dto = await request<PublicSharedInvoice>(`/api/public/invoices/${token}`);
      return {
        invoiceData: toInvoice(dto.invoice),
        templateData: {
          templateName: dto.templateName,
          businessProfile: toProfile(dto.businessProfile),
          attachments: dto.attachments ?? [],
        },
      };
    } catch (error) {
      if (error instanceof InvoicesApiError && (error.status === 404 || error.status === 401)) {
        return null;
      }
      throw error;
    }
  },

  async nextNumber(): Promise<string> {
    const body = await request<{ invoiceNumber: string }>('/api/invoices/next-number');
    return body.invoiceNumber;
  },
};
