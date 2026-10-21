import { presentResponseError } from '@/lib/apiErrorCopy';
import type {
  CreateInvoiceRequest,
  InvoiceDto,
  PublicSharedInvoice,
  RemindInvoiceRequest,
  SendInvoiceRequest,
  ShareInvoiceResponse,
  UpdateInvoiceRequest,
} from '@ledgercraft/contracts';
import type { Invoice, LineItem } from '@/types';
import { toProfile } from '@/features/business-profile/api/businessProfileApi';

export function invoicesApiEnabled(): boolean {
  return import.meta.env.VITE_INVOICES_API !== 'false';
}

export class InvoicesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'InvoicesApiError';
  }
}

function money(value: number | string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  return String(value);
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
  };
}

function toInvoice(dto: InvoiceDto): Invoice {
  return {
    id: dto.id,
    invoiceNumber: dto.invoiceNumber,
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
    additionalChargesList: dto.additionalChargesList?.map(charge => ({ ...charge, amount: Number(charge.amount) })),
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
  };
}

export function toCreateInvoiceRequest(
  invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>,
  lineItems: Array<Pick<LineItem, 'description' | 'quantity' | 'unit' | 'rate' | 'rateUnit'>>,
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
    status: invoice.status,
    items: lineItems.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unit: item.unit || 'ea',
      rate: String(item.rate),
      rateUnit: item.rateUnit || item.unit || 'ea',
    })),
  };
}

async function parseError(response: Response): Promise<{ message: string; code?: string }> {
  const presented = await presentResponseError(response);
  return { message: presented.message, code: presented.code };
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
    const parsed = await parseError(response);
    throw new InvoicesApiError(parsed.message, response.status, parsed.code);
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
    lineItems: Array<Pick<LineItem, 'description' | 'quantity' | 'unit' | 'rate' | 'rateUnit'>>,
  ): Promise<Invoice> {
    const dto = await request<InvoiceDto>('/api/invoices', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(toCreateInvoiceRequest(invoice, lineItems)),
    });
    return toInvoice(dto);
  },

  async updateStatus(id: string, status: Invoice['status']): Promise<Invoice> {
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
    lineItems?: Array<Pick<LineItem, 'description' | 'quantity' | 'unit' | 'rate' | 'rateUnit'>>,
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
      status: invoice.status,
      items: lineItems && lineItems.length > 0
        ? lineItems.map((item) => ({
            description: item.description,
            quantity: String(item.quantity),
            unit: item.unit || 'ea',
            rate: String(item.rate),
            rateUnit: item.rateUnit || item.unit || 'ea',
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

  async share(
    id: string,
    input: { templateName?: string; expiresAt?: string },
  ): Promise<ShareInvoiceResponse> {
    return request<ShareInvoiceResponse>(`/api/invoices/${id}/share`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getShared(token: string): Promise<{
    invoiceData: Invoice;
    templateData: { templateName: string; businessProfile: ReturnType<typeof toProfile> };
  } | null> {
    try {
      const dto = await request<PublicSharedInvoice>(`/api/public/invoices/${token}`);
      return {
        invoiceData: toInvoice(dto.invoice),
        templateData: {
          templateName: dto.templateName,
          businessProfile: toProfile(dto.businessProfile),
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
